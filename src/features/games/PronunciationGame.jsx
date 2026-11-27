// ============================================================================
// FILE 67/85: src/features/games/PronunciationGame.jsx
// NGUỒN GỐC: tang_5.js (Block 5.20 - Pronunciation Logic & Wrapper V1.18)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 27/11/2026 - 21:33 (GMT+7)
// NHIỆM VỤ: Động cơ xử lý Logic (usePronunciationLogic) và Container điều phối
//           (PronunciationGame) cho trò chơi Vua Ngữ Âm (Pronunciation).
//           Nâng cấp Ver 1.0 (Lượt 4.3 - Diệt 1H + 1M Radar & 0 Problems tsc):
//           1. Diệt 1H (R05 fc_total_tokens) & 1M (R05 fc_ai_memory):
//              Chuyển sang safeAddTotalTokens + AiMemoryManager +
//              Utils.safeLocalStorageSet; gỡ window.handleSaveToNotebook.
//           2. Diệt C19 & C16: Khóa safeLang ('en'|'zh'), truyền lang vào
//              ExamEngine.hydrateQuestion, xóa 100% TTS 'vi-VN', nối trực tiếp
//              speak/stopSpeaking, strip dấu *...*/<u>...</u> trước TTS/Bookmark/
//              Memory và bổ sung kho dự phòng đầy đủ cho cả EN & ZH.
//           3. Diệt S7 & S8: Dùng resolveActiveApiKey 4 tầng (không đá oan user
//              dùng Key Pool/Paid Key), chạy mượt chế độ dự phòng khi thiếu key,
//              chuẩn hóa term 4 từ cho RetryBag & đọc đạn qua getPendingItems().
//           4. Diệt C20..C24 & S9: Gỡ StrictMode Deadlock (bootTimer 50ms +
//              cancelled), khóa hasExitedRef + handleEndGameInternal diệt Ghost
//              Session & lỗi xóa phạt thoát ngang, lọc deck sạch, timeout động
//              cho ExamEngine/forgeMatrix (clearTimeout trong finally), pure
//              setTimeLeft, reset selectedIndex sau wrong_retry, đủ props
//              GameView Ver 1.4, onSaveToHarvest 2 tham số 12 cột & showToast
//              chuẩn (text, type).
// ============================================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Utils } from '@/utils/helpers';
import { AiMemoryManager } from '@/utils/memoryManager';
import { pullRetryCardWithLock } from '@/services/db';
import { QueueEngine } from '@/engines/queueEngine';
import { AiFactoryEngine } from '@/engines/aiFactory';
import { FallbackDataEngine } from '@/engines/fallbackData';
import { ExamEngine } from '@/engines/exam';
import {
  resolveActiveApiKey,
  getSafeLevelString,
  normalizeLevelAndTopic,
  getConfiguredUiCooldown
} from './common/gameHelpers';
import { PronunciationPlayScreen } from './PronunciationUI';

// ============================================================================
// CÁC HÀM TIỆN ÍCH THUẦN & PHÒNG THỦ LÕI (PURE HELPERS)
// ============================================================================

/**
 * Đọc an toàn chuỗi từ localStorage.
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
const safeStorageGet = (key, fallback = '') => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const val = window.localStorage.getItem(key);
    return val === null || val === undefined ? fallback : val;
  } catch (err) {
    return fallback;
  }
};

/**
 * Cộng dồn token AI an toàn qua Utils.safeLocalStorageSet (chống NaN & Quota).
 * @param {number} usedTokens
 */
const safeAddTotalTokens = (usedTokens) => {
  const numericUsed = Number(usedTokens);
  if (!Number.isFinite(numericUsed) || numericUsed <= 0) return;
  const rawPrev = safeStorageGet('fc_total_tokens', '0');
  const parsedPrev = parseInt(rawPrev, 10);
  const safePrev = Number.isFinite(parsedPrev) && parsedPrev >= 0 ? parsedPrev : 0;
  const nextTotal = safePrev + Math.floor(numericUsed);
  if (typeof Utils?.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_total_tokens', String(nextTotal));
  }
};

/**
 * Đọc timeout gọi AI động từ fc_ai_config (kẹp an toàn 8s..45s).
 * @param {number} [defaultMs]
 * @returns {number}
 */
const getConfiguredAiTimeoutMs = (defaultMs = 22000) => {
  try {
    const rawCfg =
      typeof Utils?.safeJsonParse === 'function'
        ? Utils.safeJsonParse('fc_ai_config', {})
        : {};
    const sec = Number(rawCfg?.loadingTime);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(45000, Math.max(8000, Math.round(sec * 1000)));
    }
  } catch (err) {
    // Bỏ qua và dùng mặc định
  }
  return defaultMs;
};

/**
 * Gỡ toàn bộ thẻ/ký hiệu đánh dấu gạch chân âm vị (*...*, <u>...</u>, __...__)
 * trước khi phát âm TTS, lưu Sổ tay, đối khớp NFC hoặc ghi nhớ AI.
 * @param {any} rawText
 * @returns {string}
 */
const stripPronunciationMarkers = (rawText) => {
  if (rawText === null || rawText === undefined) return '';
  return String(rawText)
    .replace(/<\/?u>/gi, '')
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?strong>/gi, '')
    .replace(/__/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Chuẩn hóa chuỗi khóa so sánh Unicode NFC (chữ thường, đã gỡ dấu gạch chân).
 * @param {any} text
 * @returns {string}
 */
const normalizeCompareKey = (text) => {
  const clean = stripPronunciationMarkers(text);
  if (!clean) return '';
  try {
    return clean.normalize('NFC').toLowerCase();
  } catch (err) {
    return clean.toLowerCase();
  }
};

/**
 * Ánh xạ chuỗi level sang khóa chuẩn hóa cho Kho Thu Hoạch AI (en_level_X / zh_level_X).
 * @param {string} levelStr
 * @param {'en' | 'zh'} safeLang
 * @returns {string}
 */
const toCanonicalHarvestLevelKey = (levelStr, safeLang) => {
  const raw = String(levelStr || '').trim();
  const match = raw.match(/(\d+)/);
  const num = match ? match[1] : '4';
  const prefix = safeLang === 'zh' ? 'zh_level_' : 'en_level_';
  if (/^(en|zh)_level_\d+$/i.test(raw)) {
    return raw.toLowerCase();
  }
  return prefix + num;
};

/**
 * Chạy Promise có giới hạn thời gian và luôn dọn sạch timer trong finally.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} timeoutMs
 * @param {string} label
 * @returns {Promise<T>}
 */
const runWithTimeout = (promise, timeoutMs, label) => {
  /** @type {any} */
  let timerId = null;
  const timeoutPromise = new Promise((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('Timeout ' + label + ' sau ' + String(timeoutMs) + 'ms'));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  });
};

/**
 * Đồng bộ danh sách từ vào AiMemoryManager & fc_ai_memory qua Utils.safeLocalStorageSet.
 * @param {string[]} rawTerms
 * @param {React.MutableRefObject<string[]>} historyQueueRef
 */
const syncPronunciationMemory = (rawTerms, historyQueueRef) => {
  if (!Array.isArray(rawTerms) || rawTerms.length === 0) return;

  const currentList = Array.isArray(historyQueueRef.current)
    ? [...historyQueueRef.current]
    : [];
  const existingSet = new Set(currentList.map((item) => normalizeCompareKey(item)));
  let changed = false;

  for (let i = 0; i < rawTerms.length; i += 1) {
    const clean = stripPronunciationMarkers(rawTerms[i]);
    const key = normalizeCompareKey(clean);
    if (!key) continue;

    if (typeof AiMemoryManager?.add === 'function') {
      try {
        AiMemoryManager.add(clean);
      } catch (err) {
        // Bỏ qua lỗi bộ nhớ RAM
      }
    }

    if (!existingSet.has(key)) {
      existingSet.add(key);
      currentList.push(key);
      changed = true;
    }
  }

  while (currentList.length > 400) {
    currentList.shift();
  }
  historyQueueRef.current = currentList;

  if (changed && typeof Utils?.safeLocalStorageSet === 'function') {
    Utils.safeLocalStorageSet('fc_ai_memory', JSON.stringify(currentList));
  }
};

/**
 * Kiểm tra xem 1 phần tử có phải là thẻ Flashcard gốc sạch (chống ô nhiễm deck).
 * @param {any} item
 * @returns {boolean}
 */
const isCleanFlashcard = (item) => {
  if (!item || typeof item !== 'object') return false;
  if (Array.isArray(item.options) && item.options.length > 0) return false;
  if (item.type === 'pronunciation' || item.type === 'ioe_pronunciation') return false;
  const term = typeof item.term === 'string' ? item.term.trim() : '';
  return term.length > 0;
};

/**
 * Lọc sạch danh sách thẻ Flashcard gốc và khử trùng theo NFC.
 * @param {any[]} list
 * @returns {any[]}
 */
const sanitizeCardDeck = (list) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  /** @type {any[]} */
  const clean = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i];
    if (!isCleanFlashcard(item)) continue;
    const key = normalizeCompareKey(item.term);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    clean.push(item);
  }
  return clean;
};

/**
 * Trích xuất các thẻ Flashcard gốc còn nằm trong hàng đợi chưa bắn của QueueCoordinator
 * (không trộn câu hỏi đã chế biến vào deck thẻ gốc).
 * @param {any} coordinator
 * @returns {any[]}
 */
const extractCleanBaseCardsFromQueue = (coordinator) => {
  if (!coordinator) return [];
  /** @type {any[]} */
  let pendingItems = [];
  if (typeof coordinator.getPendingItems === 'function') {
    const res = coordinator.getPendingItems();
    if (Array.isArray(res)) pendingItems = res;
  } else if (Array.isArray(coordinator.queue)) {
    pendingItems = coordinator.queue;
  }

  /** @type {any[]} */
  const extracted = [];
  for (let i = 0; i < pendingItems.length; i += 1) {
    const qItem = pendingItems[i];
    if (!qItem || typeof qItem !== 'object') continue;
    if (Array.isArray(qItem.originCards) && qItem.originCards.length > 0) {
      for (let j = 0; j < qItem.originCards.length; j += 1) {
        if (isCleanFlashcard(qItem.originCards[j])) {
          extracted.push(qItem.originCards[j]);
        }
      }
    } else if (isCleanFlashcard(qItem.origin)) {
      extracted.push(qItem.origin);
    }
  }
  return sanitizeCardDeck(extracted);
};

/**
 * Chuẩn hóa đối tượng câu hỏi Ngữ Âm để đảm bảo:
 * - Luôn có đủ options hợp lệ (>= 2 lựa chọn, đúng 1 đáp án isCorrect).
 * - Luôn có term chuẩn gồm danh sách từ (đã strip dấu) để đồng bộ RetryBag/Harvest.
 * @param {any} raw
 * @param {'en' | 'zh'} safeLang
 * @param {boolean} defaultAiGenerated
 * @param {boolean} defaultRescued
 * @returns {Record<string, any> | null}
 */
const normalizePronunciationQuestion = (
  raw,
  safeLang,
  defaultAiGenerated = false,
  defaultRescued = false
) => {
  if (!raw || typeof raw !== 'object') return null;

  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  /** @type {Array<Record<string, any>>} */
  const cleanOptions = [];

  for (let i = 0; i < rawOptions.length; i += 1) {
    const opt = rawOptions[i];
    if (!opt) continue;
    const text =
      typeof opt === 'string'
        ? opt.trim()
        : typeof opt.text === 'string'
        ? opt.text.trim()
        : typeof opt.word === 'string'
        ? opt.word.trim()
        : '';
    if (!text) continue;

    const isCorrect =
      typeof opt === 'object' &&
      (opt.isCorrect === true ||
        String(opt.isCorrect).toLowerCase() === 'true');

    cleanOptions.push({
      text,
      isCorrect,
      ipa:
        typeof opt === 'object'
          ? String(opt.ipa || opt.phonetic || opt.pronunciation || '').trim()
          : '',
      meaning:
        typeof opt === 'object'
          ? String(opt.meaning || opt.definition || '').trim()
          : ''
    });
  }

  if (cleanOptions.length < 2) return null;

  // Bảo đảm có ít nhất 1 đáp án đúng (kiểm tra theo correctIndex/answer nếu AI quên cờ isCorrect)
  let correctIdx = cleanOptions.findIndex((o) => o.isCorrect);
  if (correctIdx < 0) {
    const rawAns = normalizeCompareKey(
      raw.answer || raw.correctAnswer || raw.targetWord || ''
    );
    if (rawAns) {
      correctIdx = cleanOptions.findIndex(
        (o) => normalizeCompareKey(o.text) === rawAns
      );
    }
    if (correctIdx < 0 && Number.isInteger(raw.correctIndex)) {
      const idxNum = Number(raw.correctIndex);
      if (idxNum >= 0 && idxNum < cleanOptions.length) {
        correctIdx = idxNum;
      }
    }
    if (correctIdx < 0) return null;
    for (let i = 0; i < cleanOptions.length; i += 1) {
      cleanOptions[i] = { ...cleanOptions[i], isCorrect: i === correctIdx };
    }
  }

  // Luôn tạo term đại diện chuẩn từ 4 từ (đã gỡ dấu) để RetryBag không lệch key
  const canonicalWordsTerm = cleanOptions
    .map((o) => stripPronunciationMarkers(o.text))
    .filter(Boolean)
    .join(' • ');

  const rawPrompt =
    typeof raw.promptText === 'string' && raw.promptText.trim()
      ? raw.promptText.trim()
      : typeof raw.question === 'string' && raw.question.trim()
      ? raw.question.trim()
      : '';

  const explanationText = String(
    raw.explanation || raw.definition || raw.analysis || ''
  ).trim();

  /** @type {Record<string, any>} */
  const normalized = {
    ...raw,
    type: 'pronunciation',
    lang: safeLang,
    term: canonicalWordsTerm || stripPronunciationMarkers(raw.term || ''),
    promptText: rawPrompt,
    definition: explanationText,
    explanation: explanationText,
    options: cleanOptions,
    isAiGenerated:
      raw.isAiGenerated !== undefined
        ? Boolean(raw.isAiGenerated)
        : Boolean(defaultAiGenerated),
    _isRescued:
      raw._isRescued !== undefined
        ? Boolean(raw._isRescued)
        : Boolean(defaultRescued)
  };

  return normalized;
};

/**
 * Bộ xáo trộn chống lặp vị trí đáp án đúng bất biến (Anti-Streak nội bộ).
 * @param {Record<string, any> | null} questionData
 * @param {React.MutableRefObject<number[]>} streakTrackerRef
 * @returns {Record<string, any> | null}
 */
const applyPronunciationAntiStreak = (questionData, streakTrackerRef) => {
  if (!questionData || !Array.isArray(questionData.options)) {
    return questionData;
  }

  const baseOptions = questionData.options.map((opt) => ({ ...opt }));
  if (baseOptions.length < 2) {
    return { ...questionData, options: baseOptions };
  }

  const shuffleFn =
    typeof Utils?.shuffleArray === 'function'
      ? Utils.shuffleArray
      : (arr) => [...arr].sort(() => Math.random() - 0.5);

  const history = Array.isArray(streakTrackerRef.current)
    ? streakTrackerRef.current
    : [];
  const forbiddenIndex =
    history.length >= 2 &&
    history[history.length - 1] === history[history.length - 2]
      ? history[history.length - 1]
      : -1;

  let candidate = shuffleFn(baseOptions);
  let correctIdx = candidate.findIndex((o) => o && o.isCorrect);

  if (forbiddenIndex !== -1 && correctIdx === forbiddenIndex) {
    let attempts = 0;
    while (correctIdx === forbiddenIndex && attempts < 8) {
      candidate = shuffleFn(baseOptions);
      correctIdx = candidate.findIndex((o) => o && o.isCorrect);
      attempts += 1;
    }
    if (correctIdx === forbiddenIndex) {
      const swapIdx = (correctIdx + 1) % candidate.length;
      const cloned = [...candidate];
      const temp = cloned[correctIdx];
      cloned[correctIdx] = cloned[swapIdx];
      cloned[swapIdx] = temp;
      candidate = cloned;
      correctIdx = swapIdx;
    }
  }

  if (correctIdx >= 0) {
    const nextHistory = [...history, correctIdx].slice(-4);
    streakTrackerRef.current = nextHistory;
  }

  return {
    ...questionData,
    options: candidate
  };
};

// ============================================================================
// KHO DỮ LIỆU DỰ PHÒNG SONG NGỮ (EN & ZH) CHẤT LƯỢNG CAO
// ============================================================================

const EN_FALLBACK_PRONUNCIATION_BANK = [
  {
    definition:
      'Từ "tall" có phần gạch chân phát âm là /ɔː/, các từ còn lại phát âm là /æ/.',
    options: [
      { text: 'c*a*t', ipa: '/kæt/', isCorrect: false },
      { text: 'b*a*t', ipa: '/bæt/', isCorrect: false },
      { text: 't*a*ll', ipa: '/tɔːl/', isCorrect: true },
      { text: 'm*a*p', ipa: '/mæp/', isCorrect: false }
    ]
  },
  {
    definition:
      'Từ "moon" có phần gạch chân phát âm dài /uː/, các từ còn lại phát âm ngắn /ʊ/.',
    options: [
      { text: 'b*oo*k', ipa: '/bʊk/', isCorrect: false },
      { text: 'l*oo*k', ipa: '/lʊk/', isCorrect: false },
      { text: 'g*oo*d', ipa: '/ɡʊd/', isCorrect: false },
      { text: 'm*oo*n', ipa: '/muːn/', isCorrect: true }
    ]
  },
  {
    definition:
      'Từ "school" có cụm "ch" phát âm là /k/, các từ còn lại phát âm là /tʃ/.',
    options: [
      { text: '*ch*air', ipa: '/tʃeə(r)/', isCorrect: false },
      { text: '*ch*ild', ipa: '/tʃaɪld/', isCorrect: false },
      { text: '*ch*eese', ipa: '/tʃiːz/', isCorrect: false },
      { text: 's*ch*ool', ipa: '/skuːl/', isCorrect: true }
    ]
  },
  {
    definition:
      'Đuôi "-ed" trong "played" phát âm là /d/, các từ còn lại phát âm là /t/.',
    options: [
      { text: 'work*ed*', ipa: '/wɜːkt/', isCorrect: false },
      { text: 'watch*ed*', ipa: '/wɒtʃt/', isCorrect: false },
      { text: 'stopp*ed*', ipa: '/stɒpt/', isCorrect: false },
      { text: 'play*ed*', ipa: '/pleɪd/', isCorrect: true }
    ]
  },
  {
    definition:
      'Cụm "th" trong "this" là âm hữu thanh /ð/, các từ còn lại là âm vô thanh /θ/.',
    options: [
      { text: '*th*ink', ipa: '/θɪŋk/', isCorrect: false },
      { text: '*th*ank', ipa: '/θæŋk/', isCorrect: false },
      { text: '*th*ree', ipa: '/θriː/', isCorrect: false },
      { text: '*th*is', ipa: '/ðɪs/', isCorrect: true }
    ]
  },
  {
    definition:
      'Nguyên âm "i" trong "sit" phát âm là /ɪ/, các từ còn lại phát âm là /aɪ/.',
    options: [
      { text: 'f*i*ne', ipa: '/faɪn/', isCorrect: false },
      { text: 'l*i*ke', ipa: '/laɪk/', isCorrect: false },
      { text: 't*i*me', ipa: '/taɪm/', isCorrect: false },
      { text: 's*i*t', ipa: '/sɪt/', isCorrect: true }
    ]
  }
];

const ZH_FALLBACK_PRONUNCIATION_BANK = [
  {
    definition:
      'Chữ "马" (mǎ) mang thanh 3, các chữ gạch chân còn lại (妈 mā, 花 huā, 家 jiā) đều mang thanh 1.',
    options: [
      { text: '*妈*妈', ipa: 'māma', isCorrect: false },
      { text: '*花*朵', ipa: 'huāduǒ', isCorrect: false },
      { text: '*家*庭', ipa: 'jiātíng', isCorrect: false },
      { text: '*马*路', ipa: 'mǎlù', isCorrect: true }
    ]
  },
  {
    definition:
      'Chữ "早" (zǎo) có thanh mẫu đầu lưỡi phẳng "z", các chữ còn lại (中 zhōng, 知 zhī, 这 zhè) có thanh mẫu cuốn lưỡi "zh".',
    options: [
      { text: '*中*国', ipa: 'Zhōngguó', isCorrect: false },
      { text: '*知*道', ipa: 'zhīdào', isCorrect: false },
      { text: '*这*里', ipa: 'zhèlǐ', isCorrect: false },
      { text: '*早*上', ipa: 'zǎoshang', isCorrect: true }
    ]
  },
  {
    definition:
      'Chữ "老" (lǎo) mang thanh 3, các chữ gạch chân còn lại (学 xué, 朋 péng, 时 shí) đều mang thanh 2.',
    options: [
      { text: '*学*习', ipa: 'xuéxí', isCorrect: false },
      { text: '*朋*友', ipa: 'péngyou', isCorrect: false },
      { text: '*时*间', ipa: 'shíjiān', isCorrect: false },
      { text: '*老*师', ipa: 'lǎoshī', isCorrect: true }
    ]
  },
  {
    definition:
      'Chữ "草" (cǎo) có thanh mẫu đầu lưỡi "c", các chữ còn lại (吃 chī, 茶 chá, 长 cháng) có thanh mẫu cuốn lưỡi "ch".',
    options: [
      { text: '*吃*饭', ipa: 'chīfàn', isCorrect: false },
      { text: '*茶*叶', ipa: 'cháyè', isCorrect: false },
      { text: '*长*城', ipa: 'Chángchéng', isCorrect: false },
      { text: '*草*地', ipa: 'cǎodì', isCorrect: true }
    ]
  },
  {
    definition:
      'Chữ "四" (sì) có thanh mẫu đầu lưỡi "s", các chữ còn lại (书 shū, 水 shuǐ, 山 shān) có thanh mẫu cuốn lưỡi "sh".',
    options: [
      { text: '*书*本', ipa: 'shūběn', isCorrect: false },
      { text: '*水*果', ipa: 'shuǐguǒ', isCorrect: false },
      { text: '*山*峰', ipa: 'shānfēng', isCorrect: false },
      { text: '*四*季', ipa: 'sìjì', isCorrect: true }
    ]
  },
  {
    definition:
      'Chữ "天" (tiān) mang thanh 1, các chữ gạch chân còn lại (大 dà, 看 kàn, 去 qù) đều mang thanh 4.',
    options: [
      { text: '*大*家', ipa: 'dàjiā', isCorrect: false },
      { text: '*看*书', ipa: 'kànshū', isCorrect: false },
      { text: '*去*年', ipa: 'qùnián', isCorrect: false },
      { text: '*天*气', ipa: 'tiānqì', isCorrect: true }
    ]
  }
];

const EN_SEED_FALLBACK_CARDS = [
  { term: 'cat' },
  { term: 'school' },
  { term: 'moon' },
  { term: 'think' },
  { term: 'worked' },
  { term: 'time' }
];

const ZH_SEED_FALLBACK_CARDS = [
  { term: '妈妈' },
  { term: '中国' },
  { term: '学习' },
  { term: '吃饭' },
  { term: '书本' },
  { term: '天气' }
];

// ============================================================================
// 1. ĐỘNG CƠ LOGIC (usePronunciationLogic Hook)
// ============================================================================
/**
 * Hook quản lý toàn bộ vòng đời, hàng đợi AI, điểm số và tự lưu của Game Vua Ngữ Âm.
 * @param {any[]} cards
 * @param {Record<string, any>} config
 * @param {Record<string, any>} callbacks
 */
export const usePronunciationLogic = (cards, config, callbacks) => {
  /** @type {Record<string, any>} */
  const safeCfg = config && typeof config === 'object' ? config : {};
  /** @type {Record<string, any>} */
  const safeCallbacks =
    callbacks && typeof callbacks === 'object' ? callbacks : {};

  /** @type {'en' | 'zh'} */
  const safeLang = safeCfg.lang === 'zh' ? 'zh' : 'en';
  const normalizedMeta = useMemo(
    () => normalizeLevelAndTopic(safeCfg.level, safeCfg.topic),
    [safeCfg.level, safeCfg.topic]
  );
  const safeLevelString = getSafeLevelString(
    normalizedMeta.level || safeCfg.level,
    safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'
  );
  const safeTopicString = String(normalizedMeta.topic || '');
  const sourceMode = safeCfg.sourceMode === 'card' ? 'card' : 'ai_pure';
  const isAiMode =
    sourceMode === 'ai_pure' ? true : Boolean(safeCfg.isAiMode ?? safeCfg.aiMode ?? true);
  const timerMode = Boolean(safeCfg.timerMode);
  const parsedTimeLimit = Number(safeCfg.timeLimit);
  const safeTimeLimit =
    Number.isFinite(parsedTimeLimit) && parsedTimeLimit >= 5
      ? parsedTimeLimit
      : 20;
  const savedState = safeCfg.savedState || null;
  const savedPronun = savedState?.pronunciationState || null;
  const needsNextOnResume = Boolean(savedPronun?._needsNextOnResume);

  // Khởi tạo State lười từ phiên lưu (nếu có)
  const [currentQuestion, setCurrentQuestion] = useState(() => {
    if (savedPronun && !needsNextOnResume && savedPronun.currentQuestion) {
      return normalizePronunciationQuestion(
        savedPronun.currentQuestion,
        safeLang,
        Boolean(savedPronun.currentQuestion?.isAiGenerated),
        Boolean(savedPronun.currentQuestion?._isRescued)
      );
    }
    return null;
  });
  const [selectedIndex, setSelectedIndex] = useState(() =>
    savedPronun && !needsNextOnResume
      ? savedPronun.selectedIndex ?? null
      : null
  );
  const [checkStatus, setCheckStatus] = useState(() =>
    savedPronun && !needsNextOnResume
      ? savedPronun.checkStatus || 'idle'
      : 'idle'
  );
  const [attempts, setAttempts] = useState(() =>
    savedPronun && !needsNextOnResume ? Number(savedPronun.attempts) || 0 : 0
  );
  const [score, setScore] = useState(() => Number(savedPronun?.score) || 0);
  const [combo, setCombo] = useState(() =>
    Math.max(1, Number(savedPronun?.combo) || 1)
  );
  const [playedCount, setPlayedCount] = useState(
    () => Number(savedPronun?.playedCount) || 0
  );
  const [time, setTime] = useState(() => Number(savedPronun?.time) || 0);
  const [isFinished] = useState(false);
  const [correctCount, setCorrectCount] = useState(
    () => Number(savedPronun?.correctCount) || 0
  );
  const [wrongCount, setWrongCount] = useState(
    () => Number(savedPronun?.wrongCount) || 0
  );
  const [isGenerating, setIsGenerating] = useState(() =>
    savedPronun ? Boolean(needsNextOnResume || !savedPronun.currentQuestion) : true
  );

  // UX Timer State cho màn hình hiển thị kết quả & giới hạn từng câu
  const [resultTimer, setResultTimer] = useState(0);
  const [isResultPaused, setIsResultPaused] = useState(false);
  const [timeLeft, setTimeLeft] = useState(() =>
    savedPronun &&
    !needsNextOnResume &&
    Number.isFinite(Number(savedPronun.timeLeft))
      ? Math.max(0, Number(savedPronun.timeLeft))
      : safeTimeLimit
  );

  // Biến đếm đạn và Phanh UI (UI Cooldown)
  const [queueLength, setQueueLength] = useState(0);
  const [aiWaitTime, setAiWaitTime] = useState(() =>
    savedPronun && Number.isFinite(Number(savedPronun.aiWaitTime))
      ? Math.max(0, Number(savedPronun.aiWaitTime))
      : 0
  );

  // Refs quản lý bất đồng bộ & ổn định chữ ký hook
  /** @type {React.MutableRefObject<string[]>} */
  const historyQueueRef = useRef(
    typeof Utils?.safeJsonParse === 'function'
      ? Utils.safeJsonParse('fc_ai_memory', [])
      : []
  );
  /** @type {React.MutableRefObject<any>} */
  const coordinatorRef = useRef(null);
  const isGameActiveRef = useRef(false);
  const hasExitedRef = useRef(false);
  const isGeneratingRef = useRef(isGenerating);
  /** @type {React.MutableRefObject<any>} */
  const gameTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const retryResetTimerRef = useRef(null);
  /** @type {React.MutableRefObject<any>} */
  const autoSaveTimerRef = useRef(null);
  const isInitializingRef = useRef(false);
  const aiGeneratedCountRef = useRef(0);
  /** @type {React.MutableRefObject<any[]>} */
  const deckRef = useRef(
    sourceMode === 'card' && Array.isArray(savedPronun?.deck)
      ? sanitizeCardDeck(savedPronun.deck)
      : []
  );
  /** @type {React.MutableRefObject<any[]>} */
  const cardsRef = useRef(Array.isArray(cards) ? cards : []);
  /** @type {React.MutableRefObject<number[]>} */
  const streakTrackerRef = useRef([]);
  const fallbackCursorRef = useRef(0);
  const missingKeyNotifiedRef = useRef(false);

  /** @type {React.MutableRefObject<Record<string, any>>} */
  const configRef = useRef(safeCfg);
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const callbacksRef = useRef(safeCallbacks);
  /** @type {React.MutableRefObject<any>} */
  const globalRetryBagRef = useRef(safeCfg.globalRetryBag);

  useEffect(() => {
    configRef.current = safeCfg;
  }, [safeCfg]);

  useEffect(() => {
    callbacksRef.current = safeCallbacks;
  }, [safeCallbacks]);

  useEffect(() => {
    globalRetryBagRef.current = safeCfg.globalRetryBag;
  }, [safeCfg.globalRetryBag]);

  useEffect(() => {
    cardsRef.current = Array.isArray(cards) ? cards : [];
  }, [cards]);

  useEffect(() => {
    isGeneratingRef.current = isGenerating;
  }, [isGenerating]);

  // Toast an toàn chuẩn 2 tham số (text, type)
  const safeShowToast = useCallback((msg, type = 'success') => {
    const text =
      typeof msg === 'string'
        ? msg
        : msg && typeof msg.text === 'string'
        ? msg.text
        : '';
    if (!text) return;

    const cbToast = callbacksRef.current?.showToast;
    if (typeof cbToast === 'function') {
      cbToast(text, type);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.globalShowToast === 'function'
    ) {
      window.globalShowToast(text, type);
    }
  }, []);

  // Dừng loa an toàn qua callback hoặc SpeechSynthesis
  const stopAudioSafely = useCallback(() => {
    try {
      if (typeof callbacksRef.current?.stopSpeaking === 'function') {
        callbacksRef.current.stopSpeaking();
      } else if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    } catch (err) {
      // Bỏ qua lỗi dừng loa
    }
  }, []);

  // Dọn sạch các timer phụ trợ
  const clearTransientTimers = useCallback(() => {
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  // BỘ NÃO LƯU TRỮ VÀ AUTO-SAVE
  /** @type {React.MutableRefObject<Record<string, any>>} */
  const latestStateRef = useRef({
    currentQuestion,
    selectedIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    correctCount,
    wrongCount,
    timeLeft,
    deck: deckRef.current,
    aiWaitTime
  });

  useEffect(() => {
    latestStateRef.current = {
      currentQuestion,
      selectedIndex,
      checkStatus,
      attempts,
      score,
      combo,
      playedCount,
      time,
      correctCount,
      wrongCount,
      timeLeft,
      deck: sourceMode === 'card' ? deckRef.current : [],
      aiWaitTime
    };
  }, [
    currentQuestion,
    selectedIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    correctCount,
    wrongCount,
    timeLeft,
    aiWaitTime,
    sourceMode
  ]);

  // ==========================================================================
  // HÀM TRIGGER AUTO SAVE (Khóa chặt bằng hasExitedRef & chỉ thu hồi thẻ sạch)
  // ==========================================================================
  const triggerAutoSave = useCallback(() => {
    if (!isGameActiveRef.current || hasExitedRef.current) return;
    const onAutoSaveFn = callbacksRef.current?.onAutoSave;
    const currentData = latestStateRef.current;
    if (
      typeof onAutoSaveFn !== 'function' ||
      !currentData ||
      !currentData.currentQuestion
    ) {
      return;
    }

    const mergedDeck =
      sourceMode === 'card'
        ? sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ])
        : [];

    onAutoSaveFn({
      pronunciationState: {
        ...currentData,
        deck: mergedDeck,
        _needsNextOnResume: false
      }
    });
  }, [sourceMode]);

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      triggerAutoSave();
    }, 150);
  }, [triggerAutoSave]);

  // ĐỒNG HỒ QUÉT ĐẠN NGẦM (HONEST AMMO SCANNER 500ms - Dùng getPendingItems)
  useEffect(() => {
    const queueScanner = setInterval(() => {
      const coord = coordinatorRef.current;
      if (!coord) {
        setQueueLength(0);
        return;
      }
      if (typeof coord.getPendingItems === 'function') {
        const items = coord.getPendingItems();
        if (Array.isArray(items)) {
          const validCount = items.filter(
            (item) => item && !item._isRescued
          ).length;
          setQueueLength(validCount);
          return;
        }
      }
      if (typeof coord.length === 'function') {
        setQueueLength(coord.length());
      }
    }, 500);
    return () => clearInterval(queueScanner);
  }, []);

  // ĐỒNG HỒ LÀM NGUỘI UI (UI COOLDOWN TIMER)
  useEffect(() => {
    /** @type {any} */
    let cdTimer = null;
    if (aiWaitTime > 0 && !isGenerating && !isResultPaused) {
      cdTimer = setTimeout(() => {
        setAiWaitTime((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (cdTimer) clearTimeout(cdTimer);
    };
  }, [aiWaitTime, isGenerating, isResultPaused]);

  // ==========================================================================
  // ANTI-STREAK & TÚI NHÁP / LOG LỖI SAI
  // ==========================================================================
  const applyAntiStreak = useCallback(
    (data) => applyPronunciationAntiStreak(data, streakTrackerRef),
    []
  );

  const localPushToRetryBag = useCallback((questionData) => {
    if (
      questionData &&
      typeof callbacksRef.current?.addToRetryBag === 'function'
    ) {
      callbacksRef.current.addToRetryBag('pronunciation', questionData);
    }
  }, []);

  const localRemoveFromRetryBag = useCallback((questionData) => {
    const removeFn = callbacksRef.current?.removeFromRetryBag;
    if (typeof removeFn !== 'function' || !questionData) return;

    const termKey =
      typeof questionData === 'string'
        ? stripPronunciationMarkers(questionData)
        : stripPronunciationMarkers(questionData.term || '');
    const correctOpt =
      typeof questionData === 'object' && Array.isArray(questionData.options)
        ? questionData.options.find((o) => o && o.isCorrect)
        : null;
    const altKey = correctOpt
      ? stripPronunciationMarkers(correctOpt.text || '')
      : '';

    if (termKey) {
      removeFn('pronunciation', termKey, altKey || undefined);
    } else if (altKey) {
      removeFn('pronunciation', altKey);
    }
  }, []);

  const logMistake = useCallback(
    (question) => {
      const onLogWrongFn = callbacksRef.current?.onLogWrong;
      if (typeof onLogWrongFn !== 'function' || !question) return;

      const correctOpt = Array.isArray(question.options)
        ? question.options.find((o) => o && o.isCorrect)
        : null;
      const cleanCorrectWord = correctOpt
        ? stripPronunciationMarkers(correctOpt.text)
        : stripPronunciationMarkers(question.term || '');
      const allWords = Array.isArray(question.options)
        ? question.options
            .map((o) => stripPronunciationMarkers(o?.text || ''))
            .filter(Boolean)
            .join(' • ')
        : stripPronunciationMarkers(question.term || '');

      const mistakeCard = {
        id:
          'mistake_' +
          String(Date.now()) +
          '_' +
          Math.random().toString(36).substring(2, 9),
        type: 'mistake',
        term: allWords || cleanCorrectWord,
        pronunciation: String(correctOpt?.ipa || ''),
        definition: 'Phát âm khác: ' + cleanCorrectWord,
        analysis:
          String(question.explanation || question.definition || '').trim() ||
          'Câu hỏi phân biệt ngữ âm',
        tags: ['pronunciation', safeLevelString, sourceMode],
        level: safeLevelString,
        language: safeLang,
        timestamp: Date.now()
      };
      onLogWrongFn(mistakeCard);
    },
    [safeLang, safeLevelString, sourceMode]
  );

  // ==========================================================================
  // THU HOẠCH CÂU HỎI AI CHUẨN 2 THAM SỐ & 12 CỘT (CHẶN _isRescued)
  // ==========================================================================
  const harvestAiQuestion = useCallback(
    (normalizedQ) => {
      const saveHarvestFn = callbacksRef.current?.onSaveToHarvest;
      if (
        typeof saveHarvestFn !== 'function' ||
        !normalizedQ ||
        normalizedQ._isRescued ||
        !normalizedQ.isAiGenerated
      ) {
        return;
      }

      const correctOpt = Array.isArray(normalizedQ.options)
        ? normalizedQ.options.find((o) => o && o.isCorrect)
        : null;
      const cleanTarget = correctOpt
        ? stripPronunciationMarkers(correctOpt.text)
        : '';
      const cleanTerm =
        stripPronunciationMarkers(normalizedQ.term) || cleanTarget;
      const explanation = String(
        normalizedQ.explanation || normalizedQ.definition || ''
      ).trim();
      const canonicalLevel = toCanonicalHarvestLevelKey(
        safeLevelString,
        safeLang
      );

      saveHarvestFn(canonicalLevel, {
        term: cleanTerm,
        pronunciation: String(correctOpt?.ipa || ''),
        definition: cleanTarget
          ? 'Đáp án khác biệt: ' + cleanTarget
          : explanation,
        analysis: explanation,
        sinoViet: '',
        example: normalizedQ.options
          .map((o) => String(o?.text || ''))
          .filter(Boolean)
          .join(' | '),
        image: '',
        partOfSpeech: 'Pronunciation',
        topic: safeTopicString || 'Pronunciation',
        grammar_type: ['Pronunciation'],
        level: canonicalLevel,
        language: safeLang,
        displaySentence: cleanTerm,
        targetWord: cleanTarget,
        hint: explanation,
        gameType: 'ioe_pronunciation'
      });
    },
    [safeLang, safeLevelString, safeTopicString]
  );

  // ==========================================================================
  // KẾT THÚC & THOÁT AN TOÀN (KHÓA hasExitedRef DIỆT GHOST SESSION)
  // ==========================================================================
  const handleEndGameInternal = useCallback(
    (customStats) => {
      if (hasExitedRef.current) return;
      hasExitedRef.current = true;
      isGameActiveRef.current = false;

      stopAudioSafely();
      clearTransientTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }

      const cur = latestStateRef.current || {};
      const finalStats = {
        correct:
          customStats && Number.isFinite(Number(customStats.correct))
            ? Number(customStats.correct)
            : Number(cur.correctCount) || 0,
        wrong:
          customStats && Number.isFinite(Number(customStats.wrong))
            ? Number(customStats.wrong)
            : Number(cur.wrongCount) || 0,
        time:
          customStats && Number.isFinite(Number(customStats.time))
            ? Number(customStats.time)
            : Number(cur.time) || 0,
        score:
          customStats && Number.isFinite(Number(customStats.score))
            ? Number(customStats.score)
            : Number(cur.score) || 0
      };

      const endFn = callbacksRef.current?.onEndGame;
      if (typeof endFn === 'function') {
        endFn(finalStats);
      }
    },
    [clearTransientTimers, stopAudioSafely]
  );

  const handleSaveAndBack = useCallback(() => {
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    isGameActiveRef.current = false;

    stopAudioSafely();
    clearTransientTimers();
    if (gameTimerRef.current) {
      clearInterval(gameTimerRef.current);
      gameTimerRef.current = null;
    }

    const currentData = latestStateRef.current || {};
    const mergedDeck =
      sourceMode === 'card'
        ? sanitizeCardDeck([
            ...extractCleanBaseCardsFromQueue(coordinatorRef.current),
            ...(Array.isArray(currentData.deck) ? currentData.deck : [])
          ])
        : [];

    if (coordinatorRef.current) {
      coordinatorRef.current.destroy();
      coordinatorRef.current = null;
    }

    let finalWrongCount = Number(currentData.wrongCount) || 0;
    let finalCombo = Math.max(1, Number(currentData.combo) || 1);
    let needsNext = false;

    if (
      currentData.checkStatus !== 'correct' &&
      currentData.checkStatus !== 'failed' &&
      currentData.currentQuestion
    ) {
      localPushToRetryBag(currentData.currentQuestion);
      logMistake(currentData.currentQuestion);
      finalWrongCount += 1;
      finalCombo = 1;
      needsNext = true;
      safeShowToast('Thoát ngang bị tính 1 lỗi sai!', 'warning');
    }

    const backFn = callbacksRef.current?.onBack;
    if (typeof backFn === 'function') {
      backFn(
        currentData.currentQuestion
          ? {
              pronunciationState: {
                ...currentData,
                deck: mergedDeck,
                wrongCount: finalWrongCount,
                combo: finalCombo,
                _needsNextOnResume: needsNext
              }
            }
          : null
      );
    }
  }, [
    clearTransientTimers,
    localPushToRetryBag,
    logMistake,
    safeShowToast,
    sourceMode,
    stopAudioSafely
  ]);

  // ==========================================================================
  // HÀM CỨU HỘ KHẨN CẤP SONG NGỮ (EN & ZH HARD FALLBACK)
  // ==========================================================================
  const getPronunciationFallback = useCallback(() => {
    // 1. Thử lấy từ FallbackDataEngine trước
    try {
      if (typeof FallbackDataEngine?.getGameReadyFallback === 'function') {
        const fb = FallbackDataEngine.getGameReadyFallback(
          'pronunciation',
          safeLang,
          safeLevelString,
          configRef.current
        );
        if (
          fb &&
          typeof fb === 'object' &&
          !String(fb.term || '').includes('Lỗi hệ thống')
        ) {
          const normalizedFb = normalizePronunciationQuestion(
            fb,
            safeLang,
            false,
            true
          );
          if (normalizedFb) return normalizedFb;
        }
      }
    } catch (err) {
      // Bỏ qua lỗi đọc FallbackDataEngine
    }

    // 2. Xoay vòng bộ câu đố Ngữ Âm chuẩn theo ngôn ngữ EN / ZH
    const bank =
      safeLang === 'zh'
        ? ZH_FALLBACK_PRONUNCIATION_BANK
        : EN_FALLBACK_PRONUNCIATION_BANK;
    const idx = fallbackCursorRef.current % bank.length;
    fallbackCursorRef.current += 1;
    const sample = bank[idx];

    const normalizedSample = normalizePronunciationQuestion(
      {
        ...sample,
        options: sample.options.map((o) => ({ ...o }))
      },
      safeLang,
      false,
      true
    );

    return (
      normalizedSample || {
        type: 'pronunciation',
        lang: safeLang,
        term: 'cat • bat • tall • map',
        definition:
          'Từ "tall" có âm /ɔː/ khác với âm /æ/ ở các từ còn lại.',
        explanation:
          'Từ "tall" có âm /ɔː/ khác với âm /æ/ ở các từ còn lại.',
        options: [
          { text: 'c*a*t', ipa: '/kæt/', isCorrect: false },
          { text: 'b*a*t', ipa: '/bæt/', isCorrect: false },
          { text: 't*a*ll', ipa: '/tɔːl/', isCorrect: true },
          { text: 'm*a*p', ipa: '/mæp/', isCorrect: false }
        ],
        isAiGenerated: false,
        _isRescued: true
      }
    );
  }, [safeLang, safeLevelString]);

  // Lấy hạt giống thẻ sạch cho Card Hybrid Mode
  const getSeedCardsForCardMode = useCallback(() => {
    const cleanUserCards = sanitizeCardDeck(cardsRef.current);
    if (cleanUserCards.length > 0) return cleanUserCards;

    try {
      /** @type {any} */
      const fbEngine = FallbackDataEngine;
      if (typeof fbEngine?.getFallbackData === 'function') {
        const fbList = fbEngine.getFallbackData(safeLang, 'vocab');
        const cleanFb = sanitizeCardDeck(fbList);
        if (cleanFb.length > 0) return cleanFb;
      }
    } catch (err) {
      // Dùng bộ hạt giống tĩnh bên dưới
    }

    return safeLang === 'zh'
      ? [...ZH_SEED_FALLBACK_CARDS]
      : [...EN_SEED_FALLBACK_CARDS];
  }, [safeLang]);

  // ==========================================================================
  // ĐƯỜNG ỐNG DỮ LIỆU THỐNG NHẤT (UNIFIED DATA PIPELINE - FETCH TASK)
  // ==========================================================================
  const fetchTask = useCallback(async () => {
    if (!isGameActiveRef.current || hasExitedRef.current) return null;

    // 1. ĐÁNH CHẶN 30%: Bốc từ túi nháp bằng khóa nguyên tử
    if (typeof pullRetryCardWithLock === 'function') {
      const pulledCard = pullRetryCardWithLock(
        'pronunciation',
        globalRetryBagRef.current,
        safeLang
      );
      if (pulledCard) {
        const normalizedPulled = normalizePronunciationQuestion(
          pulledCard,
          safeLang,
          Boolean(pulledCard.isAiGenerated),
          Boolean(pulledCard._isRescued)
        );
        if (normalizedPulled) return normalizedPulled;
      }
    }

    const isPureMode = sourceMode === 'ai_pure';
    const currentApiKey = resolveActiveApiKey(configRef.current?.apiKey);
    const aiTimeoutMs = getConfiguredAiTimeoutMs(22000);

    // Nếu cả 4 tầng đều không có API Key -> cung cấp mượt bộ dự phòng EN/ZH
    if (!currentApiKey) {
      if (!missingKeyNotifiedRef.current) {
        missingKeyNotifiedRef.current = true;
        safeShowToast(
          'Chưa có API Key — đang dùng bộ câu đố Ngữ Âm dự phòng!',
          'warning'
        );
      }
      return getPronunciationFallback();
    }

    // 2. AI PURE MODE: Tự động sinh thử thách Ngữ Âm qua ExamEngine (kèm lang chuẩn)
    if (isPureMode && typeof ExamEngine?.hydrateQuestion === 'function') {
      try {
        const meta = {
          id: 'pronunciation_' + String(Date.now()),
          type: 'ioe_pronunciation',
          lang: safeLang,
          level: safeLevelString,
          topic: safeTopicString,
          dataMode: 'vocab',
          mode: 'minigame'
        };
        const freshHistory =
          typeof Utils?.safeJsonParse === 'function'
            ? Utils.safeJsonParse('fc_ai_memory', [])
            : [];
        const qData = await runWithTimeout(
          ExamEngine.hydrateQuestion(meta, currentApiKey, freshHistory),
          aiTimeoutMs,
          'ExamEngine.hydrateQuestion(pronunciation)'
        );

        if (qData && qData.content) {
          const normalizedQ = normalizePronunciationQuestion(
            qData.content,
            safeLang,
            !qData.content._isRescued,
            Boolean(qData.content._isRescued)
          );

          if (normalizedQ) {
            syncPronunciationMemory(
              normalizedQ.options.map((o) => String(o.text || '')),
              historyQueueRef
            );
            harvestAiQuestion(normalizedQ);

            if (isInitializingRef.current && isGameActiveRef.current) {
              aiGeneratedCountRef.current += 1;
              safeShowToast(
                'Đã nạp xong câu ' +
                  String(aiGeneratedCountRef.current) +
                  ' bằng AI...',
                'success'
              );
            }
            return normalizedQ;
          }
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e || '');
        console.warn('AI Pronunciation Pure Fallback:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Máy Trộn Đề Pronunciation AI', e);
        }
      }
    }

    // 2.5 HYBRID AI MODE (Thử thách AI với Thẻ gốc làm hạt giống)
    if (!isPureMode && typeof AiFactoryEngine?.forgeMatrix === 'function') {
      /** @type {any} */
      let poppedCard = null;
      try {
        if (deckRef.current.length === 0) {
          const seedCards = getSeedCardsForCardMode();
          deckRef.current =
            typeof Utils?.shuffleArray === 'function'
              ? Utils.shuffleArray([...seedCards])
              : [...seedCards];
        }
        poppedCard = deckRef.current.shift() || null;

        if (poppedCard) {
          const historyPrompt =
            typeof AiFactoryEngine.getHistoryPrompt === 'function'
              ? AiFactoryEngine.getHistoryPrompt(historyQueueRef.current)
              : '';
          const cleanSeedTerm = stripPronunciationMarkers(poppedCard.term);
          const hybridPrompt =
            historyPrompt +
            '\nCRITICAL REQUIREMENT: You MUST include the exact word "' +
            cleanSeedTerm +
            '" as one of the 4 items. Mark the tested sound/syllable using *...* (e.g., c*a*t) and provide IPA/Pinyin for every option.';

          const parsed = await runWithTimeout(
            AiFactoryEngine.forgeMatrix(
              'pronunciation',
              safeLevelString,
              safeLang,
              currentApiKey,
              safeTopicString,
              hybridPrompt,
              'vocab'
            ),
            aiTimeoutMs,
            'AiFactoryEngine.forgeMatrix(pronunciation)'
          );

          if (parsed && parsed._tokenUsage) {
            safeAddTotalTokens(parsed._tokenUsage.totalTokenCount || 0);
          }

          if (parsed && Array.isArray(parsed.options) && parsed.options.length >= 2) {
            const normalizedQ = normalizePronunciationQuestion(
              parsed,
              safeLang,
              true,
              false
            );

            if (normalizedQ) {
              syncPronunciationMemory(
                normalizedQ.options.map((o) => String(o.text || '')),
                historyQueueRef
              );
              harvestAiQuestion(normalizedQ);

              if (isInitializingRef.current && isGameActiveRef.current) {
                aiGeneratedCountRef.current += 1;
                safeShowToast(
                  'Đã nạp xong câu ' +
                    String(aiGeneratedCountRef.current) +
                    ' bằng AI...',
                  'success'
                );
              }

              return {
                ...normalizedQ,
                originCards: [poppedCard]
              };
            }
          }

          // Nếu AI trả cấu trúc lỗi -> trả thẻ về deck để không mất thẻ
          deckRef.current.unshift(poppedCard);
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e || '');
        console.warn('Hybrid AI Pronunciation Fallback:', errMsg);
        if (typeof window !== 'undefined' && typeof window.logSystemEvent === 'function') {
          window.logSystemEvent('Lỗi API/Parse Lò đúc Pronunciation Hybrid AI', e);
        }
        if (poppedCard) deckRef.current.unshift(poppedCard);
      }
    }

    // Trả về null để QueueEngine tiếp tục thử / hoặc kích hoạt Hard Fallback khi pop
    return null;
  }, [
    getPronunciationFallback,
    getSeedCardsForCardMode,
    harvestAiQuestion,
    safeLang,
    safeLevelString,
    safeShowToast,
    safeTopicString,
    sourceMode
  ]);

  // ==========================================================================
  // VÒNG ĐỜI AUTO-SAVE ĐỊNH KỲ (KHAI BÁO AN TOÀN VỚI hasExitedRef)
  // ==========================================================================
  useEffect(() => {
    const intervalTimer = setInterval(() => triggerAutoSave(), 5000);
    return () => {
      clearInterval(intervalTimer);
      triggerAutoSave();
    };
  }, [triggerAutoSave]);

  // ==========================================================================
  // KHỞI TẠO & PHỤC HỒI VÒNG ĐỜI GAME (CHUẨN REACT 18 STRICTMODE)
  // ==========================================================================
  useEffect(() => {
    let cancelled = false;
    hasExitedRef.current = false;
    isGameActiveRef.current = true;
    missingKeyNotifiedRef.current = false;

    const startGameTimer = () => {
      if (gameTimerRef.current) clearInterval(gameTimerRef.current);
      gameTimerRef.current = setInterval(() => {
        if (
          isGameActiveRef.current &&
          !hasExitedRef.current &&
          !isGeneratingRef.current
        ) {
          setTime((prev) => prev + 1);
        }
      }, 1000);
    };

    const boot = async () => {
      if (cancelled || hasExitedRef.current) return;

      const activeKey = resolveActiveApiKey(configRef.current?.apiKey);
      const aiTimeoutMs = getConfiguredAiTimeoutMs(22000);
      const isOfflineFastTrack = !activeKey || (sourceMode === 'card' && !isAiMode);

      // Nhánh 1: Phục hồi ván chơi đang dở (Resume)
      if (savedPronun) {
        if (sourceMode === 'card') {
          const restoredDeck = sanitizeCardDeck(savedPronun.deck);
          deckRef.current =
            restoredDeck.length > 0 ? restoredDeck : getSeedCardsForCardMode();
        } else {
          deckRef.current = [];
        }

        if (coordinatorRef.current) coordinatorRef.current.destroy();
        if (typeof QueueEngine?.createQueueCoordinator === 'function') {
          coordinatorRef.current = QueueEngine.createQueueCoordinator(
            fetchTask,
            4
          );
        }

        if (needsNextOnResume || !savedPronun.currentQuestion) {
          setIsGenerating(true);
          try {
            if (coordinatorRef.current) {
              await coordinatorRef.current.maintain(
                false,
                aiTimeoutMs,
                isOfflineFastTrack
              );
            }
          } catch (err) {
            console.warn('Resume maintain error:', err);
          }

          if (cancelled || !isGameActiveRef.current || hasExitedRef.current) {
            return;
          }

          let data = coordinatorRef.current ? coordinatorRef.current.pop() : null;
          if (!data) {
            if (
              typeof window !== 'undefined' &&
              typeof window.logSystemEvent === 'function'
            ) {
              window.logSystemEvent(
                'Queue cạn đạn lúc Resume Game Ngữ Âm',
                'Kích hoạt Hard Fallback'
              );
            }
            safeShowToast(
              'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
              'warning'
            );
            data = getPronunciationFallback();
          }

          if (data) {
            setCurrentQuestion(applyAntiStreak(data));
            setSelectedIndex(null);
            setCheckStatus('idle');
            setAttempts(0);
            setIsGenerating(false);
            setTimeLeft(safeTimeLimit);
            setAiWaitTime(activeKey ? getConfiguredUiCooldown(9) : 0);
          }
        } else if (coordinatorRef.current) {
          coordinatorRef.current
            .maintain(false, aiTimeoutMs, isOfflineFastTrack)
            .catch((err) => {
              console.warn('Background maintain resume error:', err);
            });
        }

        if (!cancelled && isGameActiveRef.current && !hasExitedRef.current) {
          startGameTimer();
        }
        return;
      }

      // Nhánh 2: Bắt đầu ván mới
      setIsGenerating(true);
      setPlayedCount(0);
      setScore(0);
      setCombo(1);
      setTime(0);
      setCorrectCount(0);
      setWrongCount(0);
      isInitializingRef.current = true;
      aiGeneratedCountRef.current = 0;
      streakTrackerRef.current = [];

      if (sourceMode === 'card') {
        const seedCards = getSeedCardsForCardMode();
        deckRef.current =
          typeof Utils?.shuffleArray === 'function'
            ? Utils.shuffleArray([...seedCards])
            : [...seedCards];
      } else {
        deckRef.current = [];
      }

      if (coordinatorRef.current) coordinatorRef.current.destroy();
      if (typeof QueueEngine?.createQueueCoordinator === 'function') {
        coordinatorRef.current = QueueEngine.createQueueCoordinator(
          fetchTask,
          4
        );
      } else {
        safeShowToast('Lỗi hệ thống: Không tìm thấy QueueEngine', 'error');
        setIsGenerating(false);
        isInitializingRef.current = false;
        return;
      }

      try {
        await coordinatorRef.current.maintain(
          true,
          aiTimeoutMs,
          isOfflineFastTrack
        );
      } catch (err) {
        console.warn('Initial maintain error:', err);
      }

      if (cancelled || !isGameActiveRef.current || hasExitedRef.current) {
        return;
      }

      let firstData = coordinatorRef.current ? coordinatorRef.current.pop() : null;
      if (!firstData) {
        if (
          typeof window !== 'undefined' &&
          typeof window.logSystemEvent === 'function'
        ) {
          window.logSystemEvent(
            'Queue cạn đạn lúc khởi tạo Game Ngữ Âm',
            'Kích hoạt Hard Fallback'
          );
        }
        if (activeKey) {
          safeShowToast(
            'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
            'warning'
          );
        }
        firstData = getPronunciationFallback();
      }

      if (firstData && !cancelled && isGameActiveRef.current) {
        setCurrentQuestion(applyAntiStreak(firstData));
        setSelectedIndex(null);
        setCheckStatus('idle');
        setAttempts(0);
        setIsGenerating(false);
        isInitializingRef.current = false;
        setTimeLeft(safeTimeLimit);
        setAiWaitTime(activeKey ? getConfiguredUiCooldown(9) : 0);
        if (activeKey) {
          safeShowToast('Hoàn tất! Bắt đầu luyện phát âm.', 'success');
        }
        startGameTimer();
      } else if (!cancelled && isGameActiveRef.current) {
        setIsGenerating(false);
        isInitializingRef.current = false;
        handleEndGameInternal({ correct: 0, time: 0, wrong: 0 });
      }
    };

    const bootTimer = setTimeout(() => {
      boot();
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      isGameActiveRef.current = false;
      isInitializingRef.current = false;
      stopAudioSafely();
      clearTransientTimers();
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
        gameTimerRef.current = null;
      }
      if (coordinatorRef.current) {
        coordinatorRef.current.destroy();
        coordinatorRef.current = null;
      }
    };
  }, [
    applyAntiStreak,
    clearTransientTimers,
    fetchTask,
    getPronunciationFallback,
    getSeedCardsForCardMode,
    handleEndGameInternal,
    isAiMode,
    needsNextOnResume,
    safeShowToast,
    safeTimeLimit,
    savedPronun,
    sourceMode,
    stopAudioSafely
  ]);

  // ==========================================================================
  // CHUYỂN VÒNG & TƯƠNG TÁC NGƯỜI DÙNG
  // ==========================================================================
  const proceedToNext = useCallback(
    (defaultDelaySec) => {
      if (isGameActiveRef.current && !hasExitedRef.current) {
        let delaySec = defaultDelaySec;
        if (aiWaitTime > delaySec) {
          delaySec = aiWaitTime;
        }
        if (delaySec < 1) delaySec = 1;
        setResultTimer(delaySec);
      }
    },
    [aiWaitTime]
  );

  const nextRound = useCallback(() => {
    if (isGenerating || !isGameActiveRef.current || hasExitedRef.current) {
      return;
    }

    stopAudioSafely();
    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }

    setResultTimer(0);
    setIsResultPaused(false);
    setPlayedCount((prev) => prev + 1);

    const activeKey = resolveActiveApiKey(configRef.current?.apiKey);
    const aiTimeoutMs = getConfiguredAiTimeoutMs(22000);
    const isOfflineFastTrack = !activeKey || (sourceMode === 'card' && !isAiMode);

    if (coordinatorRef.current && coordinatorRef.current.length() > 0) {
      const nextData = coordinatorRef.current.pop();
      const resolvedNext = nextData || getPronunciationFallback();
      setCurrentQuestion(applyAntiStreak(resolvedNext));
      setSelectedIndex(null);
      setCheckStatus('idle');
      setAttempts(0);
      setTimeLeft(safeTimeLimit);
      setAiWaitTime(activeKey ? getConfiguredUiCooldown(9) : 0);
      scheduleAutoSave();
      return;
    }

    setIsGenerating(true);
    const maintainPromise = coordinatorRef.current
      ? coordinatorRef.current.maintain(false, aiTimeoutMs, isOfflineFastTrack)
      : Promise.resolve();

    Promise.resolve(maintainPromise)
      .catch((err) => {
        console.warn('Next round maintain error:', err);
      })
      .finally(() => {
        if (!isGameActiveRef.current || hasExitedRef.current) return;

        let data = coordinatorRef.current ? coordinatorRef.current.pop() : null;
        if (!data) {
          if (
            typeof window !== 'undefined' &&
            typeof window.logSystemEvent === 'function'
          ) {
            window.logSystemEvent(
              'Queue cạn đạn lúc chuyển vòng Game Ngữ Âm',
              'Kích hoạt Hard Fallback'
            );
          }
          if (activeKey) {
            safeShowToast(
              'Mạng yếu, đã kích hoạt dữ liệu dự phòng!',
              'warning'
            );
          }
          data = getPronunciationFallback();
        }

        if (data) {
          setCurrentQuestion(applyAntiStreak(data));
          setSelectedIndex(null);
          setCheckStatus('idle');
          setAttempts(0);
          setIsGenerating(false);
          setTimeLeft(safeTimeLimit);
          setAiWaitTime(activeKey ? getConfiguredUiCooldown(9) : 0);
          scheduleAutoSave();
        } else {
          setIsGenerating(false);
          handleEndGameInternal();
        }
      });
  }, [
    applyAntiStreak,
    getPronunciationFallback,
    handleEndGameInternal,
    isAiMode,
    isGenerating,
    safeShowToast,
    safeTimeLimit,
    scheduleAutoSave,
    sourceMode,
    stopAudioSafely
  ]);

  const handleOptionClick = useCallback(
    (idx) => {
      if (
        checkStatus === 'correct' ||
        checkStatus === 'failed' ||
        checkStatus === 'wrong_retry' ||
        isGenerating ||
        !currentQuestion ||
        !Array.isArray(currentQuestion.options)
      ) {
        return;
      }

      const clickedOpt = currentQuestion.options[idx];
      if (!clickedOpt) return;

      if (retryResetTimerRef.current) {
        clearTimeout(retryResetTimerRef.current);
        retryResetTimerRef.current = null;
      }

      setSelectedIndex(idx);
      const isCorrect =
        clickedOpt.isCorrect === true ||
        String(clickedOpt.isCorrect).toLowerCase() === 'true';

      if (isCorrect) {
        if (attempts === 0) {
          localRemoveFromRetryBag(currentQuestion);
        }
        setCheckStatus('correct');
        setCorrectCount((p) => p + 1);
        setScore((p) => p + 15 * combo);
        setCombo((p) => p + 1);
        safeShowToast('Xuất sắc!', 'success');
        proceedToNext(5);
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setCombo(1);
        setScore((p) => Math.max(0, p - 5));
        if (newAttempts >= 2) {
          localPushToRetryBag(currentQuestion);
          setCheckStatus('failed');
          setWrongCount((p) => p + 1);
          safeShowToast('Đã hết lượt!', 'error');
          logMistake(currentQuestion);
          proceedToNext(7);
        } else {
          setCheckStatus('wrong_retry');
          safeShowToast(
            'Chưa đúng! Còn ' + String(2 - newAttempts) + ' lượt.',
            'warning'
          );
          retryResetTimerRef.current = setTimeout(() => {
            retryResetTimerRef.current = null;
            if (!isGameActiveRef.current || hasExitedRef.current) return;
            setCheckStatus((p) => (p === 'wrong_retry' ? 'idle' : p));
            setSelectedIndex(null);
          }, 900);
        }
      }

      scheduleAutoSave();
    },
    [
      attempts,
      checkStatus,
      combo,
      currentQuestion,
      isGenerating,
      localPushToRetryBag,
      localRemoveFromRetryBag,
      logMistake,
      proceedToNext,
      safeShowToast,
      scheduleAutoSave
    ]
  );

  const handleSkip = useCallback(() => {
    if (
      checkStatus === 'correct' ||
      checkStatus === 'failed' ||
      isGenerating ||
      !currentQuestion
    ) {
      return;
    }

    if (retryResetTimerRef.current) {
      clearTimeout(retryResetTimerRef.current);
      retryResetTimerRef.current = null;
    }

    localPushToRetryBag(currentQuestion);
    setCombo(1);
    setCheckStatus('failed');
    setWrongCount((p) => p + 1);
    setAttempts(2);
    safeShowToast('Đã bỏ qua!', 'error');
    logMistake(currentQuestion);
    proceedToNext(7);
    scheduleAutoSave();
  }, [
    checkStatus,
    currentQuestion,
    isGenerating,
    localPushToRetryBag,
    logMistake,
    proceedToNext,
    safeShowToast,
    scheduleAutoSave
  ]);

  // ĐỘNG CƠ ĐẾM NGƯỢC THỜI GIAN TỪNG CÂU (PURE UPDATER - KHÔNG SIDE-EFFECT)
  useEffect(() => {
    /** @type {any} */
    let timerId = null;
    if (
      timerMode &&
      checkStatus !== 'correct' &&
      checkStatus !== 'failed' &&
      !isGenerating &&
      currentQuestion &&
      timeLeft > 0
    ) {
      timerId = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, [timerMode, checkStatus, isGenerating, currentQuestion, timeLeft]);

  // CƠ CHẾ GIẬT CÒ KHI HẾT GIỜ (TIMEOUT TRIGGER)
  useEffect(() => {
    if (
      timerMode &&
      timeLeft === 0 &&
      checkStatus !== 'correct' &&
      checkStatus !== 'failed' &&
      !isGenerating &&
      currentQuestion
    ) {
      const timeoutId = setTimeout(() => {
        if (!isGameActiveRef.current || hasExitedRef.current) return;
        localPushToRetryBag(currentQuestion);
        setCombo(1);
        setAttempts(2);
        setCheckStatus('failed');
        setWrongCount((p) => p + 1);
        safeShowToast('Hết giờ! Xem đáp án nhé.', 'error');
        logMistake(currentQuestion);
        proceedToNext(7);
        scheduleAutoSave();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [
    timeLeft,
    timerMode,
    checkStatus,
    isGenerating,
    currentQuestion,
    logMistake,
    safeShowToast,
    scheduleAutoSave,
    localPushToRetryBag,
    proceedToNext
  ]);

  // CHỐNG RACE CONDITION CHO AUTO-NEXT
  useEffect(() => {
    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer > 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => {
        setResultTimer((t) => (t > 0 ? t - 1 : 0));
      }, 1000);
      return () => clearTimeout(id);
    }
    if (
      (checkStatus === 'correct' || checkStatus === 'failed') &&
      resultTimer === 0 &&
      !isResultPaused &&
      !isGenerating
    ) {
      const id = setTimeout(() => nextRound(), 0);
      return () => clearTimeout(id);
    }
  }, [checkStatus, resultTimer, isResultPaused, isGenerating, nextRound]);

  const toggleResultPause = useCallback(() => {
    setIsResultPaused((p) => !p);
  }, []);

  return {
    currentQuestion,
    selectedIndex,
    checkStatus,
    attempts,
    score,
    combo,
    playedCount,
    time,
    isFinished,
    isGenerating,
    aiCountdown: 0,
    correctCount,
    wrongCount,
    resultTimer,
    isResultPaused,
    toggleResultPause,
    timeLeft,
    queueLength,
    handleOptionClick,
    handleSkip,
    nextRound,
    handleNext: nextRound,
    handleSaveAndBack,
    handleEndGameInternal,
    aiWaitTime
  };
};

// ============================================================================
// 2. GAME WRAPPER COMPONENT (PronunciationGame)
// ============================================================================
/**
 * Container điều phối trò chơi Vua Ngữ Âm (tương thích 100% GameView Ver 1.4).
 * @param {Record<string, any>} props
 */
export const PronunciationGame = ({
  cards = [],
  t = undefined,
  onFinish = undefined,
  onEndGame = undefined,
  onQuit = undefined,
  onBack = undefined,
  mainColor = 'indigo',
  lang = 'en',
  apiKey = '',
  onBookmark = undefined,
  onSaveToNotebook = undefined,
  notebook = [],
  onLogWrong = undefined,
  settings = undefined,
  config = undefined,
  onUpdateCards = undefined,
  onSaveToHarvest = undefined,
  savedState = undefined,
  onAutoSave = undefined,
  onPlay = undefined,
  speak = undefined,
  stopSpeaking = undefined,
  showToast = undefined,
  currentLevel = undefined,
  currentTopic = undefined,
  dataMode = 'vocab',
  globalRetryBag = undefined,
  addToRetryBag = undefined,
  removeFromRetryBag = undefined
}) => {
  /** @type {'en' | 'zh'} */
  const safeLang = lang === 'zh' ? 'zh' : 'en';

  const handleFinishGame = useCallback(
    (stats) => {
      const correct = Number(stats?.correct) || 0;
      const elapsed = Number(stats?.time) || 0;
      const wrong = Number(stats?.wrong) || 0;

      if (typeof onFinish === 'function') {
        onFinish(correct, elapsed, wrong);
      } else if (typeof onEndGame === 'function') {
        onEndGame({ correct, wrong, time: elapsed });
      }
    },
    [onFinish, onEndGame]
  );

  /** @type {Record<string, any>} */
  const safeConfig = useMemo(() => {
    /** @type {Record<string, any>} */
    const base = config && typeof config === 'object' ? { ...config } : {};
    return {
      ...base,
      level:
        base.level !== undefined && base.level !== null && base.level !== ''
          ? base.level
          : currentLevel || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_4'),
      topic:
        base.topic !== undefined && base.topic !== null
          ? base.topic
          : currentTopic || '',
      dataMode: base.dataMode || dataMode || 'vocab',
      sourceMode: base.sourceMode === 'card' ? 'card' : 'ai_pure',
      timeLimit: Number(base.timeLimit) > 0 ? Number(base.timeLimit) : 20
    };
  }, [config, currentLevel, currentTopic, dataMode, safeLang]);

  /** @type {Record<string, any>} */
  const hookConfig = useMemo(
    () => ({
      ...safeConfig,
      isAiMode:
        safeConfig.sourceMode === 'ai_pure'
          ? true
          : Boolean(safeConfig.aiMode ?? true),
      apiKey,
      lang: safeLang,
      timeLimit: safeConfig.timeLimit,
      savedState,
      globalRetryBag
    }),
    [apiKey, globalRetryBag, safeConfig, safeLang, savedState]
  );

  const hookCallbacks = useMemo(
    () => ({
      showToast:
        typeof showToast === 'function'
          ? showToast
          : typeof window !== 'undefined' &&
            typeof window.globalShowToast === 'function'
          ? window.globalShowToast
          : undefined,
      onLogWrong,
      onUpdateCards,
      onSaveToHarvest,
      onAutoSave,
      onBack: onQuit || onBack,
      addToRetryBag,
      removeFromRetryBag,
      onEndGame: handleFinishGame,
      stopSpeaking
    }),
    [
      addToRetryBag,
      handleFinishGame,
      onAutoSave,
      onBack,
      onLogWrong,
      onQuit,
      onSaveToHarvest,
      onUpdateCards,
      removeFromRetryBag,
      showToast,
      stopSpeaking
    ]
  );

  const logic = usePronunciationLogic(cards, hookConfig, hookCallbacks);

  const handleBookmarkSafe = useCallback(
    (payload) => {
      const saveFn = onBookmark || onSaveToNotebook;
      if (typeof saveFn === 'function') {
        saveFn(payload);
        return;
      }
      if (typeof showToast === 'function') {
        showToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      } else if (
        typeof window !== 'undefined' &&
        typeof window.globalShowToast === 'function'
      ) {
        window.globalShowToast('Vui lòng lưu từ Sổ tay chính!', 'warning');
      }
    },
    [onBookmark, onSaveToNotebook, showToast]
  );

  // Tập tra cứu Sổ tay chuẩn NFC O(1)
  const notebookKeySet = useMemo(() => {
    const set = new Set();
    if (!Array.isArray(notebook)) return set;
    for (let i = 0; i < notebook.length; i += 1) {
      const item = notebook[i];
      if (!item) continue;
      const key = normalizeCompareKey(item.term || '');
      if (key) set.add(key);
    }
    return set;
  }, [notebook]);

  const isBookmarked = useMemo(() => {
    const options = logic.currentQuestion?.options;
    if (!Array.isArray(options)) return false;
    const correctOpt = options.find((o) => o && o.isCorrect);
    const targetKey = normalizeCompareKey(correctOpt?.text || '');
    return Boolean(targetKey && notebookKeySet.has(targetKey));
  }, [logic.currentQuestion, notebookKeySet]);

  // Phát âm chuẩn: luôn strip dấu gạch chân *...*/<u>...</u> và ưu tiên speak từ GameView
  const safeOnPlay = useCallback(
    (rawText) => {
      const cleanText = stripPronunciationMarkers(rawText);
      if (!cleanText) return;

      const speaker = onPlay || speak;
      if (typeof speaker === 'function') {
        speaker(cleanText);
        return;
      }

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(cleanText);
          u.lang = safeLang === 'zh' ? 'zh-CN' : 'en-US';
          window.speechSynthesis.speak(u);
        } catch (err) {
          console.warn('Pronunciation fallback TTS error:', err);
        }
      }
    },
    [onPlay, safeLang, speak]
  );

  return (
    <PronunciationPlayScreen
      t={t}
      mainColor={mainColor}
      lang={safeLang}
      config={safeConfig}
      {...logic}
      onBack={logic.handleSaveAndBack}
      onEndGame={logic.handleEndGameInternal}
      onSaveToNotebook={handleBookmarkSafe}
      isBookmarked={isBookmarked}
      settings={settings}
      onPlay={safeOnPlay}
    />
  );
};

// Gắn vào window để tương thích ngược trong quá trình chuyển đổi
if (typeof window !== 'undefined') {
  window.Block5_20_usePronunciationLogic = usePronunciationLogic;
  window.usePronunciationLogic = usePronunciationLogic;
  window.Block5_20_PronunciationGame = PronunciationGame;
  window.PronunciationGame = PronunciationGame;
}

export default PronunciationGame;