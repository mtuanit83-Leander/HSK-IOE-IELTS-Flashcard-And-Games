import { detectSentence, shuffleArray, safeJsonParse } from '../../utils/helpers.js';
import { GameAlgoEngine } from '../gameOfflineEngine.js';

export const ExamNormalizer = {
  // ============================================================================
  // HÀM CHUẨN HÓA DỮ LIỆU ĐẦU RA CHO MINI-GAMES (NORMALIZER)
  // ============================================================================
  _normalizeForMinigame: async function (
    tempGeneratedData,
    tType,
    metadata,
    targetLang,
    level,
    topic,
    apiKey
  ) {
    if (!tempGeneratedData) return null;

    const safeType = String(tType || '').toLowerCase();

    // 1. BƠM NHIỄU CHO GAME GHÉP CÂU (SCRAMBLE NOISE INJECTION)
    if (safeType.includes('scramble') && tempGeneratedData.term) {
      try {
        let parts = [];
        const isZh = targetLang === 'zh';
        const isSentence = detectSentence
          ? detectSentence(tempGeneratedData.term)
          : tempGeneratedData.term.includes(' ');
        const dataType = metadata?.dataMode || (isSentence ? 'sentence' : 'word');

        const cleanAndLower = (textArr) =>
          textArr
            .map((p) => {
              let cleaned = String(p || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
              if (!isZh) cleaned = cleaned.toLowerCase();
              return cleaned;
            })
            .filter((p) => p.trim() !== '');

        if (isZh) {
          parts = tempGeneratedData.term.split('');
        } else {
          parts = isSentence ? tempGeneratedData.term.split(' ') : tempGeneratedData.term.split('');
        }
        parts = cleanAndLower(parts);

        let targetCount = 2;
        const len = parts.length;
        if (len >= 5 && len <= 10) targetCount = Math.floor(Math.random() * 2) + 4;
        else if (len > 10) targetCount = Math.floor(Math.random() * 3) + 5;

        let noiseWords = [];
        if (
          apiKey &&
          GameAlgoEngine &&
          GameAlgoEngine.ScrambleNoiseEngine &&
          GameAlgoEngine.ScrambleNoiseEngine.ai_getNoise
        ) {
          try {
            await new Promise((r) => setTimeout(r, 2000));
            const aiCallPromise = GameAlgoEngine.ScrambleNoiseEngine.ai_getNoise(
              tempGeneratedData.term,
              targetLang,
              dataType,
              apiKey,
              targetCount,
              level,
              topic
            );
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('AI Noise Timeout')), 15000)
            );
            noiseWords = await Promise.race([aiCallPromise, timeoutPromise]);
          } catch (e) {
            console.warn('Scramble AI Noise Fallback:', e.message);
          }
        }

        if (
          (!noiseWords || noiseWords.length === 0) &&
          GameAlgoEngine &&
          GameAlgoEngine.ScrambleNoiseEngine &&
          GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise
        ) {
          const cleanDeck = safeJsonParse('fc_data_' + targetLang, []);
          noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(
            tempGeneratedData.term,
            cleanDeck,
            targetLang,
            dataType,
            targetCount
          );
        }

        if (noiseWords && noiseWords.length > 0) {
          let finalNoiseWords = [];
          if (isZh || dataType === 'word') {
            noiseWords.forEach((w) => {
              const cleanW = String(w).replace(/\s/g, '');
              finalNoiseWords.push(...cleanW.split(''));
            });
          } else {
            finalNoiseWords = noiseWords;
          }
          finalNoiseWords = shuffleArray(cleanAndLower(finalNoiseWords)).slice(0, targetCount);
          parts.push(...finalNoiseWords);
        }

        tempGeneratedData.parts = shuffleArray(parts);
      } catch (err) {
        const basicParts = tempGeneratedData.term
          .split(targetLang === 'zh' ? '' : ' ')
          .filter((w) => w.trim() !== '');
        tempGeneratedData.parts = shuffleArray(basicParts);
      }
    }

    // 2. CHUẨN HÓA CẤU TRÚC CHO TỪNG DẠNG MINI-GAME
    let formattedData = tempGeneratedData;

    if (safeType.includes('quiz') || safeType === 'ioe_multiple_choice') {
      formattedData = {
        question: tempGeneratedData,
        options: tempGeneratedData.options,
        origin: tempGeneratedData,
        isAiGenerated: true
      };
    } else if (safeType.includes('image_quiz') || safeType.includes('imagequiz')) {
      formattedData = {
        question: tempGeneratedData,
        term: tempGeneratedData.term,
        options: tempGeneratedData.options,
        origin: tempGeneratedData,
        isAiGenerated: true
      };
    } else if (safeType.includes('scramble')) {
      formattedData = {
        origin: tempGeneratedData,
        parts: tempGeneratedData.parts,
        isAiGenerated: true
      };
    } else if (safeType.includes('fill_blank') || safeType.includes('fillblank')) {
      formattedData = {
        ...tempGeneratedData,
        origin: tempGeneratedData,
        isAiGenerated: true
      };
    } else if (safeType.includes('spot_mistake') || safeType.includes('spotmistake')) {
      formattedData = {
        ...tempGeneratedData,
        origin: tempGeneratedData,
        isAiGenerated: true
      };
    } else if (safeType === 'match' || safeType === 'ioe_match') {
      let realCards = [];
      let trapCards = [];

      if (tempGeneratedData.correctPairs) {
        realCards = tempGeneratedData.correctPairs.map((p) => ({
          term: p.term,
          definition: p.definition
        }));
        if (tempGeneratedData.trapPairs) {
          trapCards = tempGeneratedData.trapPairs.map((p) => ({
            term: p.wrongSentence || p.wrongWord || 'Trap',
            distortedTerm: p.wrongSentence || p.wrongWord || 'Trap',
            definition: p.definition,
            explanation: p.explanation,
            originalTerm: p.correction || p.wrongWord
          }));
        }
      } else if (tempGeneratedData.items) {
        realCards = tempGeneratedData.items.map((p) => ({
          term: p.term,
          definition: p.definition
        }));
      } else {
        realCards = [
          {
            term: tempGeneratedData.term || 'Error',
            definition: tempGeneratedData.definition || 'Error'
          }
        ];
      }

      const leftItems = [...realCards, ...trapCards].map((c, i) => ({
        id: `left_${i}_${Date.now()}`,
        term: c.term,
        definition: c.definition,
        isTrap: trapCards.some((t) => t.term === c.term),
        origin: c
      }));

      const rightItems = [];
      realCards.forEach((c, i) => {
        rightItems.push({
          id: `right_real_${i}_${Date.now()}`,
          term: c.term,
          isTrap: false
        });
      });
      trapCards.forEach((t, i) => {
        rightItems.push({
          id: `right_trap_${i}_${Date.now()}`,
          term: t.distortedTerm || t.term,
          isTrap: true,
          originalTerm: t.originalTerm,
          explanation: t.explanation
        });
      });

      const shuffleNoAdjacent = (arr) => {
        let res = [...arr];
        let valid = false;
        let tries = 0;
        while (!valid && tries < 50) {
          res = shuffleArray(res);
          valid = true;
          for (let j = 0; j < res.length - 1; j++) {
            if (res[j].isTrap && res[j + 1].isTrap) {
              valid = false;
              break;
            }
          }
          tries++;
        }
        return res;
      };

      formattedData = {
        pairs: realCards,
        leftItems: shuffleNoAdjacent(leftItems),
        rightItems: shuffleNoAdjacent(rightItems),
        isAiGenerated: true
      };
    } else if (safeType.includes('odd_one_out') || safeType.includes('oddoneout')) {
      formattedData = { ...tempGeneratedData, isAiGenerated: true };
    } else if (safeType.includes('pronunciation')) {
      formattedData = { ...tempGeneratedData, isAiGenerated: true };
    } else if (safeType.includes('listening')) {
      formattedData = { ...tempGeneratedData, isAiGenerated: true, type: 'listening' };
    }

    return formattedData;
  }
};

export const _normalizeForMinigame = ExamNormalizer._normalizeForMinigame.bind(ExamNormalizer);

export default ExamNormalizer;