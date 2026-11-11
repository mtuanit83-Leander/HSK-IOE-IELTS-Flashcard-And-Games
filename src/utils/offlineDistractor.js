/**
 * @file src/utils/offlineDistractor.js
 * @description Bộ máy tạo nhiễu dự phòng (Offline Distractor Engine). Tạo đáp án bẫy khi AI mất kết nối mạng.
 * @origin Tầng 2 - Block 2.1b (Offline Distractor Engine)
 */

import { Utils } from './helpers';

export const OfflineDistractorEngine = {
  generate: (correctAnswer, deck, lang, askMode) => {
    const distractors = new Set();
    const hasLogographic = /[\u4e00-\u9fa5]/.test(correctAnswer);
    const hasSpace = /\s/.test(correctAnswer.trim());
    const isLogographic = hasLogographic && !hasSpace;
    
    const getTokens = (str) => isLogographic ? Array.from(str) : str.split(/\s+/);
    const joinTokens = (arr) => isLogographic ? arr.join('') : arr.join(' ');
    const extractWord = (str) => str.replace(/[^\p{L}\p{N}]/gu, '');
    
    const correctTokens = getTokens(correctAnswer);
    const pool = [];
    
    deck.forEach(c => {
      const text = askMode === 'def' ? c.term : c.definition;
      if (text && text !== correctAnswer) {
        getTokens(text).forEach(t => {
          const cleaned = extractWord(t);
          if (cleaned.length > 0) pool.push(cleaned);
        });
      }
    });
    
    const validPool = pool;
    const getRandToken = () => validPool.length > 0 ? validPool[Math.floor(Math.random() * validPool.length)] : (isLogographic ? "的" : "the");
    
    const validTargetIndices = [];
    correctTokens.forEach((t, i) => {
      if (extractWord(t).length > 0) validTargetIndices.push(i);
    });
    
    let attempts = 0;
    while(distractors.size < 4 && attempts < 100) {
      attempts++;
      let newD = "";
      let method = Math.floor(Math.random() * 3) + 1;
      let tokens = [...correctTokens];
      
      if (validTargetIndices.length <= 1) {
        newD = getRandToken();
      } else {
        let anchorCount = validTargetIndices.length > 4 ? 2 : 1;
        let mutableIndices = validTargetIndices.slice(anchorCount);
        if (mutableIndices.length === 0) mutableIndices = validTargetIndices;
        
        if (method === 1) {
          let startIdx = mutableIndices[0];
          let removedLength = tokens.length - startIdx;
          tokens = tokens.slice(0, startIdx);
          let tokensToAdd = Math.max(1, removedLength + Math.floor(Math.random() * 3) - 1);
          for(let k=0; k < tokensToAdd; k++) {
            tokens.push(getRandToken());
          }
          newD = joinTokens(tokens);
        } else if (method === 2) {
          let tIdx = mutableIndices[Math.floor(Math.random() * mutableIndices.length)];
          if (Math.random() > 0.5) {
            tokens.splice(tIdx, 1);
          } else {
            tokens[tIdx] = getRandToken();
          }
          newD = joinTokens(tokens);
        } else {
          let tIdx = mutableIndices[Math.floor(Math.random() * mutableIndices.length)];
          let word = tokens[tIdx];
          let cleanW = extractWord(word);
          if (isLogographic) {
            tokens[tIdx] = getRandToken();
          } else {
            if (cleanW && cleanW.length > 3) {
              let arr = Array.from(cleanW);
              let charIdx = Math.floor(Math.random() * (arr.length - 2)) + 1;
              let temp = arr[charIdx]; arr[charIdx] = arr[charIdx+1]; arr[charIdx+1] = temp;
              tokens[tIdx] = word.replace(cleanW, arr.join(''));
            } else {
              tokens[tIdx] = getRandToken();
            }
          }
          newD = joinTokens(tokens);
        }
      }
      newD = newD.trim();
      if (newD && newD !== correctAnswer && newD !== joinTokens(correctTokens)) {
        distractors.add(newD);
      }
    }
    
    // Sử dụng Utils.shuffleArray thay vì window.Utils.shuffleArray
    const fallbackDeck = Utils.shuffleArray([...deck]).filter(c => {
      const text = askMode === 'def' ? c.term : c.definition;
      return text !== correctAnswer;
    });
    
    let fIdx = 0;
    while(distractors.size < 4 && fIdx < fallbackDeck.length) {
      const text = askMode === 'def' ? fallbackDeck[fIdx].term : fallbackDeck[fIdx].definition;
      if (text && text.trim()) distractors.add(text.trim());
      fIdx++;
    }
    
    return Array.from(distractors).slice(0, 4);
  }
};