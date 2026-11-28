// ============================================================================
// FILE 24/85: src/engines/exam/examFallback.js
// NGUỒN GỐC: tang_2.js (Block 2.7b - ExamFallback)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 28/11/2026 - 06:33 (GMT+7)
// NHIỆM VỤ: Động cơ cứu hộ đồng cấp theo chỉ mục tuyến tính (Linear Pick)
//           khi AI hoặc mạng gặp sự cố trong phòng thi Khảo thí (IOE / IELTS / HSK).
//           Nâng cấp Ver 1.0 (Lượt 5.2 - Zero-TSC Polish):
//           1. Diệt trọn 9/9 lỗi TS2339: Khai báo JSDoc chuẩn cho Q_TYPES
//              (IoeDataEngine.QUESTION_TYPES), safeFallbackEngine & fallbackCards.
//           2. Bảo vệ safeLevel khi mảng level rỗng [] hoặc null/undefined và
//              chống NaN khi tham số index sai kiểu.
//           3. Nâng cấp song ngữ EN/ZH chuẩn hóa cho IOE_PRONUNCIATION (có đánh
//              dấu gạch chân *...* + IPA/Pinyin), IOE_SPOT_MISTAKE (tránh ghép
//              đuôi 's' vào chữ Hán) & IELTS_READING_PASSAGE.
//           4. Chặn bắn chữ Hán lên Bing trong IOE_IMAGE_QUIZ: dùng ảnh hợp lệ
//              có sẵn hoặc buildSmartImageUrl từ từ khóa Tiếng Anh sạch.
// ============================================================================

import {
  shuffleArray,
  buildSmartImageUrl,
  isValidImageUrl
} from '../../utils/helpers.js';
import { IoeDataEngine } from '../pedagogyEngine.js';
import { FallbackDataEngine } from '../fallbackData.js';

const CJK_REGEX = /[\u4e00-\u9fa5]/;

/**
 * Xáo trộn mảng an toàn (dự phòng khi shuffleArray không khả dụng).
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
const safeShuffle = (arr) => {
  if (!Array.isArray(arr)) return [];
  return typeof shuffleArray === 'function' ? shuffleArray([...arr]) : [...arr];
};

/**
 * Tạo URL ảnh minh họa sạch (ưu tiên URL hợp lệ có sẵn; tuyệt đối không bắn
 * chữ Hán lên Bing).
 * @param {string | undefined} rawImage
 * @param {string} preferredKeyword
 * @param {string} fallbackEnglishKeyword
 * @returns {string}
 */
const resolveSafeFallbackImageUrl = (
  rawImage,
  preferredKeyword,
  fallbackEnglishKeyword
) => {
  if (
    typeof rawImage === 'string' &&
    rawImage.trim() &&
    typeof isValidImageUrl === 'function' &&
    isValidImageUrl(rawImage.trim())
  ) {
    return rawImage.trim();
  }

  const candidate = String(preferredKeyword || '').trim();
  const cleanEnKeyword =
    candidate && !CJK_REGEX.test(candidate) && /[a-zA-Z]{2,}/.test(candidate)
      ? candidate
      : String(fallbackEnglishKeyword || 'apple fruit').trim();

  if (typeof buildSmartImageUrl === 'function') {
    const built = buildSmartImageUrl(cleanEnKeyword, '', 'vocab');
    if (built) return built;
  }

  return `https://tse4.mm.bing.net/th?q=${encodeURIComponent(
    `${cleanEnKeyword} clean illustration no text`
  )}&w=400&h=300&c=7&rs=1&p=0`;
};

/**
 * Lấy chỉ mục số nguyên không âm an toàn.
 * @param {number | string | null | undefined} index
 * @returns {number}
 */
const normalizeIndex = (index) => {
  const num = Number(index);
  if (!Number.isFinite(num)) return 0;
  return Math.abs(Math.trunc(num));
};

export const ExamFallback = {
  // ============================================================================
  // 0. HÀM CỨU HỘ ĐỒNG CẤP (TIERED FALLBACK DATA ENGINE CHO MOCK TEST)
  // ============================================================================
  /**
   * Sinh dữ liệu câu hỏi cứu hộ đồng cấp theo chỉ mục tuyến tính.
   * @param {string} type
   * @param {string | string[] | null | undefined} level
   * @param {string} track
   * @param {number} [index]
   * @returns {Record<string, any>}
   */
  _generateFallbackData: function (type, level, track, index = 0) {
    const lang = track === 'hsk' ? 'zh' : 'en';
    const safeType = String(type || '').trim();
    const rawLevel = Array.isArray(level) ? level[0] : level;
    const safeLevel =
      typeof rawLevel === 'string' && rawLevel.trim()
        ? rawLevel.trim()
        : lang === 'zh'
        ? 'zh_level_1'
        : 'en_level_4';
    const safeRawIndex = normalizeIndex(index);

    /** @type {Array<{ term: string, definition: string, image?: string, enKeyword?: string }>} */
    let fallbackCards = [];

    // Nâng cấp kho cứu hộ học thuật cho IELTS
    if (track === 'ielts') {
      fallbackCards = [
        { term: 'Hypothesis', definition: 'Giả thuyết', enKeyword: 'science hypothesis' },
        { term: 'Paradigm', definition: 'Hệ chuẩn', enKeyword: 'abstract pattern diagram' },
        { term: 'Empirical', definition: 'Dựa trên thực nghiệm', enKeyword: 'laboratory experiment' },
        { term: 'Qualitative', definition: 'Định tính', enKeyword: 'interview notebook research' },
        { term: 'Quantitative', definition: 'Định lượng', enKeyword: 'statistics bar chart' },
        { term: 'Correlation', definition: 'Sự tương quan', enKeyword: 'connected data graph' },
        { term: 'Subsequent', definition: 'Xảy ra sau đó', enKeyword: 'timeline arrow sequence' },
        { term: 'Intrinsic', definition: 'Thuộc về bản chất', enKeyword: 'crystal core gem' }
      ];
    } else {
      // Trích xuất trực tiếp mảng gốc, bỏ qua hàm trộn ngẫu nhiên của FallbackDataEngine
      const mode =
        safeType.includes('sentence') ||
        safeType.includes('spot_mistake') ||
        safeType.includes('fill_blank') ||
        safeType.includes('scramble') ||
        safeType.includes('reading')
          ? 'sentence'
          : 'vocab';

      try {
        /** @type {Record<string, any>} */
        const safeFallbackEngine = /** @type {any} */ (FallbackDataEngine) || {};
        const rawData = safeFallbackEngine?.[lang]?.[mode]?.[safeLevel];
        if (Array.isArray(rawData) && rawData.length > 0) {
          fallbackCards = rawData
            .filter((item) => item && typeof item.term === 'string' && item.term.trim())
            .map((item) => ({
              term: String(item.term || '').trim(),
              definition: String(item.definition || '').trim() || 'Nghĩa dự phòng',
              image: typeof item.image === 'string' ? item.image : undefined
            }));
        }
      } catch (e) {
        console.warn('Linear extraction failed', e);
      }

      // Nếu vẫn thiếu thẻ (< 4), rút kho cứu hộ song ngữ chuẩn EN / ZH
      if (fallbackCards.length < 4) {
        fallbackCards =
          lang === 'zh'
            ? [
                { term: '苹果', definition: 'Quả táo', enKeyword: 'red apple fruit' },
                { term: '香蕉', definition: 'Quả chuối', enKeyword: 'yellow banana fruit' },
                { term: '小猫', definition: 'Con mèo', enKeyword: 'cute cat animal' },
                { term: '小狗', definition: 'Con chó', enKeyword: 'cute dog animal' },
                { term: '小鸟', definition: 'Con chim', enKeyword: 'blue bird animal' },
                { term: '小鱼', definition: 'Con cá', enKeyword: 'orange fish animal' }
              ]
            : [
                { term: 'Apple', definition: 'Quả táo', enKeyword: 'red apple fruit' },
                { term: 'Banana', definition: 'Quả chuối', enKeyword: 'yellow banana fruit' },
                { term: 'Cat', definition: 'Con mèo', enKeyword: 'cute cat animal' },
                { term: 'Dog', definition: 'Con chó', enKeyword: 'cute dog animal' },
                { term: 'Bird', definition: 'Con chim', enKeyword: 'blue bird animal' },
                { term: 'Fish', definition: 'Con cá', enKeyword: 'orange fish animal' }
              ];
      }
    }

    // Bốc xoay vòng TUYẾN TÍNH (Linear Pick) theo index để đảm bảo không bị lặp
    const safeIndex = safeRawIndex % fallbackCards.length;
    const baseCard = fallbackCards[safeIndex] || {
      term: lang === 'zh' ? '苹果' : 'Apple',
      definition: 'Quả táo',
      enKeyword: 'red apple fruit'
    };

    // Trích xuất 3 thẻ tịnh tiến an toàn
    const card1 = fallbackCards[(safeIndex + 1) % fallbackCards.length];
    const card2 = fallbackCards[(safeIndex + 2) % fallbackCards.length];
    const card3 = fallbackCards[(safeIndex + 3) % fallbackCards.length];

    const opt1 = card1?.definition || 'Nhiễu 1';
    const opt2 = card2?.definition || 'Nhiễu 2';
    const opt3 = card3?.definition || 'Nhiễu 3';

    const optTerm1 = card1?.term || (lang === 'zh' ? '蚂蚁' : 'Ant');
    const optTerm2 = card2?.term || (lang === 'zh' ? '蝴蝶' : 'Butterfly');
    const optTerm3 = card3?.term || (lang === 'zh' ? '蜜蜂' : 'Bee');

    /** @type {Record<string, any>} */
    const Q_TYPES = /** @type {any} */ (IoeDataEngine)?.QUESTION_TYPES || {};

    switch (safeType) {
      case Q_TYPES.IOE_MULTIPLE_CHOICE || 'ioe_multiple_choice':
      case 'ioe_multiple_choice':
      case Q_TYPES.IOE_MATCH || 'ioe_match':
      case 'ioe_match':
      case 'ielts_reading_mcq':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          options: safeShuffle([
            { text: baseCard.definition, isCorrect: true },
            { text: opt1, isCorrect: false },
            { text: opt2, isCorrect: false },
            { text: opt3, isCorrect: false }
          ]),
          isAiGenerated: false
        };

      case Q_TYPES.IOE_SPOT_MISTAKE || 'ioe_spot_mistake':
      case 'ioe_spot_mistake': {
        if (lang === 'zh' || CJK_REGEX.test(baseCard.term)) {
          const zhMistakes = [
            {
              wrongSentence: '我每天都去学校了学习。',
              wrongWord: '了',
              correction: '(bỏ 了)',
              explanation:
                'Hành động lặp lại theo thói quen ("每天") không dùng trợ từ hoàn thành "了" chen trước động từ mục đích.'
            },
            {
              wrongSentence: '他昨天很喜欢吃一个苹果们。',
              wrongWord: '们',
              correction: '苹果',
              explanation:
                'Hậu tố "们" chỉ dùng cho danh từ chỉ người và không đi kèm với số lượng từ ("一个").'
            },
            {
              wrongSentence: '她比我很高一点儿。',
              wrongWord: '很',
              correction: '高',
              explanation:
                'Trong câu so sánh chữ "比", không dùng phó từ mức độ "很" trước tính từ.'
            }
          ];
          const zhPicked = zhMistakes[safeRawIndex % zhMistakes.length];
          return {
            wrongSentence: zhPicked.wrongSentence,
            wrongWord: zhPicked.wrongWord,
            correction: zhPicked.correction,
            explanation: zhPicked.explanation,
            origin: baseCard,
            isAiGenerated: false
          };
        }

        const isSingleWord = !baseCard.term.includes(' ');
        const wrongWord = isSingleWord ? `${baseCard.term}s` : baseCard.term;
        return {
          wrongSentence: isSingleWord
            ? `This is a ${wrongWord}.`
            : `${baseCard.term}s`,
          wrongWord: isSingleWord ? wrongWord : `${baseCard.term}s`,
          correction: baseCard.term,
          explanation: 'Lỗi hình thái từ (Hệ thống dự phòng tự động).',
          origin: baseCard,
          isAiGenerated: false
        };
      }

      case Q_TYPES.IOE_FILL_BLANK || 'ioe_fill_blank':
      case 'ioe_fill_blank':
      case 'ielts_listening_fill':
        return {
          displaySentence: '[__________]',
          targetWord: baseCard.term,
          hint: baseCard.definition,
          origin: baseCard,
          isAiGenerated: false
        };

      case Q_TYPES.IOE_SCRAMBLE || 'ioe_scramble':
      case 'ioe_scramble':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          isAiGenerated: false
        };

      case Q_TYPES.IOE_ODD_ONE_OUT || 'ioe_odd_one_out':
      case 'ioe_odd_one_out': {
        const oddLabel = lang === 'zh' ? '桌子 (Cái bàn)' : 'Lạc loài';
        return {
          words: safeShuffle([
            baseCard.term,
            optTerm1,
            optTerm2,
            oddLabel
          ]),
          oddWord: oddLabel,
          explanation: 'Từ khác loại do hệ thống dự phòng cung cấp.',
          originCards: [baseCard],
          isAiGenerated: false
        };
      }

      case Q_TYPES.IOE_PRONUNCIATION || 'ioe_pronunciation':
      case 'ioe_pronunciation': {
        if (lang === 'zh') {
          const zhPronFallbacks = [
            {
              term: 'Chọn từ có thanh điệu KHÁC loại (Pinyin)',
              definition:
                'Từ 爸 (bà) mang thanh 4 (/↘/), khác với các từ còn lại mang thanh 1 (/ˉ/).',
              options: [
                { text: '妈 (m*ā*)', phonetic: 'mā (thanh 1)', isCorrect: false },
                { text: '他 (t*ā*)', phonetic: 'tā (thanh 1)', isCorrect: false },
                { text: '爸 (b*à*)', phonetic: 'bà (thanh 4)', isCorrect: true },
                { text: '拉 (l*ā*)', phonetic: 'lā (thanh 1)', isCorrect: false }
              ]
            },
            {
              term: 'Chọn từ có thanh mẫu KHÁC loại (Pinyin)',
              definition:
                'Từ 书 (*sh*ū) có thanh mẫu uốn lưỡi "sh", khác với nhóm âm đầu lưỡi phẳng "s".',
              options: [
                { text: '三 (*s*ān)', phonetic: 'sān', isCorrect: false },
                { text: '四 (*s*ì)', phonetic: 'sì', isCorrect: false },
                { text: '书 (*sh*ū)', phonetic: 'shū', isCorrect: true },
                { text: '岁 (*s*uì)', phonetic: 'suì', isCorrect: false }
              ]
            }
          ];
          const zhItem = zhPronFallbacks[safeRawIndex % zhPronFallbacks.length];
          return {
            term: zhItem.term,
            definition: zhItem.definition,
            explanation: zhItem.definition,
            options: safeShuffle(zhItem.options),
            isAiGenerated: false
          };
        }

        const enPronFallbacks = [
          {
            term: 'Chọn từ có phần gạch chân phát âm khác biệt',
            definition:
              'Từ "tall" có phần gạch chân phát âm /ɔː/, khác với âm /æ/ ở các từ còn lại.',
            options: [
              { text: 'c*a*t', phonetic: '/kæt/', isCorrect: false },
              { text: 'b*a*t', phonetic: '/bæt/', isCorrect: false },
              { text: 't*a*ll', phonetic: '/tɔːl/', isCorrect: true },
              { text: 'm*a*p', phonetic: '/mæp/', isCorrect: false }
            ]
          },
          {
            term: 'Chọn từ có phần gạch chân phát âm khác biệt',
            definition:
              'Từ "hour" có âm "h" câm (/aʊər/), khác với âm /h/ ở các từ còn lại.',
            options: [
              { text: '*h*ouse', phonetic: '/haʊs/', isCorrect: false },
              { text: '*h*appy', phonetic: '/ˈhæpi/', isCorrect: false },
              { text: '*h*our', phonetic: '/aʊər/', isCorrect: true },
              { text: '*h*at', phonetic: '/hæt/', isCorrect: false }
            ]
          },
          {
            term: 'Chọn từ có phần gạch chân phát âm khác biệt',
            definition:
              'Từ "books" có đuôi -s phát âm /s/, khác với âm /z/ ở các từ còn lại.',
            options: [
              { text: 'pen*s*', phonetic: '/penz/', isCorrect: false },
              { text: 'bag*s*', phonetic: '/bæɡz/', isCorrect: false },
              { text: 'book*s*', phonetic: '/bʊks/', isCorrect: true },
              { text: 'dog*s*', phonetic: '/dɒɡz/', isCorrect: false }
            ]
          }
        ];
        const enItem = enPronFallbacks[safeRawIndex % enPronFallbacks.length];
        return {
          term: enItem.term,
          definition: enItem.definition,
          explanation: enItem.definition,
          options: safeShuffle(enItem.options),
          isAiGenerated: false
        };
      }

      case Q_TYPES.IOE_IMAGE_QUIZ || 'ioe_image_quiz':
      case 'ioe_image_quiz':
        return {
          term: baseCard.term,
          definition: baseCard.definition,
          options: safeShuffle([
            {
              text: baseCard.term,
              image: resolveSafeFallbackImageUrl(
                baseCard.image,
                baseCard.enKeyword || baseCard.term,
                'apple fruit'
              ),
              isCorrect: true
            },
            {
              text: optTerm1,
              image: resolveSafeFallbackImageUrl(
                card1?.image,
                card1?.enKeyword || optTerm1,
                'ant insect'
              ),
              isCorrect: false
            },
            {
              text: optTerm2,
              image: resolveSafeFallbackImageUrl(
                card2?.image,
                card2?.enKeyword || optTerm2,
                'butterfly insect'
              ),
              isCorrect: false
            },
            {
              text: optTerm3,
              image: resolveSafeFallbackImageUrl(
                card3?.image,
                card3?.enKeyword || optTerm3,
                'bee insect'
              ),
              isCorrect: false
            }
          ]),
          isAiGenerated: false
        };

      case Q_TYPES.IOE_LISTENING || 'ioe_listening':
      case 'ioe_listening':
        if (lang === 'zh') {
          const zhListeningFallbacks = [
            {
              audioScript: '你好，我叫王明。我喜欢吃苹果。',
              term: '王明喜欢吃什么？',
              options: [
                '苹果 (Píngguǒ)',
                '香蕉 (Xiāngjiāo)',
                '西瓜 (Xīguā)',
                '米饭 (Mǐfàn)'
              ],
              explanation:
                "Trong đoạn băng, người nói nói rằng: '我喜欢吃苹果' (Tôi thích ăn táo)."
            },
            {
              audioScript: '今天天气很好，阳光明媚。',
              term: '今天天气怎么样？',
              options: [
                '很好 (Hěn hǎo)',
                '下雨 (Xià yǔ)',
                '很冷 (Hěn lěng)',
                '下雪 (Xià xuě)'
              ],
              explanation:
                "Trong đoạn băng có câu: '今天天气很好' (Hôm nay thời tiết rất tốt)."
            }
          ];
          const listenItemZh =
            zhListeningFallbacks[safeRawIndex % zhListeningFallbacks.length];
          return {
            audioScript: listenItemZh.audioScript,
            term: listenItemZh.term,
            options: safeShuffle([
              { text: listenItemZh.options[0], isCorrect: true },
              { text: listenItemZh.options[1], isCorrect: false },
              { text: listenItemZh.options[2], isCorrect: false },
              { text: listenItemZh.options[3], isCorrect: false }
            ]),
            explanation: listenItemZh.explanation,
            isAiGenerated: false
          };
        } else {
          const listeningFallbacks = [
            {
              audioScript:
                'The weather is very sunny today. I want to go to the beach.',
              term: 'What is the weather like today?',
              options: ['Sunny', 'Rainy', 'Cloudy', 'Snowy'],
              explanation:
                "The speaker said: 'The weather is very sunny today'."
            },
            {
              audioScript:
                'I have a new red bicycle. I ride it to school every day.',
              term: 'What color is the bicycle?',
              options: ['Red', 'Blue', 'Green', 'Yellow'],
              explanation: "The speaker said: 'I have a new red bicycle'."
            },
            {
              audioScript: 'My favorite food is pizza. I eat it on weekends.',
              term: "What is the speaker's favorite food?",
              options: ['Pizza', 'Burger', 'Pasta', 'Salad'],
              explanation: "The speaker said: 'My favorite food is pizza'."
            },
            {
              audioScript: 'She is a doctor. She works in a big hospital.',
              term: 'Where does she work?',
              options: ['Hospital', 'School', 'Shop', 'Bank'],
              explanation: "The speaker said: 'She works in a big hospital'."
            },
            {
              audioScript: 'They are playing football in the park.',
              term: 'What are they playing?',
              options: ['Football', 'Tennis', 'Basketball', 'Golf'],
              explanation:
                "The speaker said: 'They are playing football'."
            }
          ];
          const listenItemEn =
            listeningFallbacks[safeRawIndex % listeningFallbacks.length];
          return {
            audioScript: listenItemEn.audioScript,
            term: listenItemEn.term,
            options: safeShuffle([
              { text: listenItemEn.options[0], isCorrect: true },
              { text: listenItemEn.options[1], isCorrect: false },
              { text: listenItemEn.options[2], isCorrect: false },
              { text: listenItemEn.options[3], isCorrect: false }
            ]),
            explanation: listenItemEn.explanation,
            isAiGenerated: false
          };
        }

      case Q_TYPES.IELTS_READING_PASSAGE || 'ielts_reading_passage':
      case 'ielts_reading_passage': {
        if (lang === 'zh') {
          const zhReadingFallbacks = [
            {
              passage:
                '小明每天早上七点起床，吃完早饭以后骑自行车去学校。他最喜欢学习汉语和数学。',
              term: '小明怎么去学校？',
              options: ['骑自行车', '坐公共汽车', '坐地铁', '走路'],
              exp: 'Đoạn văn viết: "骑自行车去学校" (đạp xe đến trường).'
            },
            {
              passage:
                '周末的时候，小红经常和朋友去图书馆看书。她觉得看书可以学到很多新知识。',
              term: '小红周末经常去哪里？',
              options: ['图书馆', '电影院', '公园', '超市'],
              exp: 'Đoạn văn viết: "经常和朋友去图书馆看书" (thường đi thư viện đọc sách).'
            }
          ];
          const zhReadItem =
            zhReadingFallbacks[safeRawIndex % zhReadingFallbacks.length];
          return {
            passage: zhReadItem.passage,
            term: zhReadItem.term,
            options: safeShuffle([
              { text: zhReadItem.options[0], isCorrect: true },
              { text: zhReadItem.options[1], isCorrect: false },
              { text: zhReadItem.options[2], isCorrect: false },
              { text: zhReadItem.options[3], isCorrect: false }
            ]),
            explanation: zhReadItem.exp,
            isAiGenerated: false
          };
        }

        const readingFallbacks = [
          {
            passage:
              'Education is crucial for the development of society. It equips individuals with the skills needed to succeed.',
            term: 'What does education equip individuals with?',
            options: [
              'Skills needed to succeed',
              'Money',
              'Free time',
              'Nothing'
            ],
            exp: 'The text states that education equips individuals with skills.'
          },
          {
            passage:
              'The Internet has revolutionized how we communicate. We can now connect with people instantly across the globe.',
            term: 'What has the Internet revolutionized?',
            options: [
              'How we communicate',
              'How we eat',
              'How we sleep',
              'How we travel'
            ],
            exp: 'The text states that the Internet has revolutionized how we communicate.'
          },
          {
            passage:
              'Regular exercise is beneficial for physical health. It helps reduce the risk of chronic diseases.',
            term: 'What does regular exercise help reduce?',
            options: [
              'Risk of chronic diseases',
              'Intelligence',
              'Height',
              'Age'
            ],
            exp: 'The text says it helps reduce the risk of chronic diseases.'
          },
          {
            passage:
              'Reading books enhances vocabulary and critical thinking. It is a productive habit for people of all ages.',
            term: 'What does reading books enhance?',
            options: [
              'Vocabulary and critical thinking',
              'Physical strength',
              'Eyesight',
              'Hearing'
            ],
            exp: 'The text mentions it enhances vocabulary and critical thinking.'
          },
          {
            passage:
              'Climate change is a pressing global issue. It requires immediate action from all countries to mitigate its effects.',
            term: 'What kind of issue is climate change?',
            options: [
              'A pressing global issue',
              'A minor local problem',
              'A fictional story',
              'A positive trend'
            ],
            exp: 'The text describes it as a pressing global issue.'
          }
        ];
        const readItem =
          readingFallbacks[safeRawIndex % readingFallbacks.length];
        return {
          passage: readItem.passage,
          term: readItem.term,
          options: safeShuffle([
            { text: readItem.options[0], isCorrect: true },
            { text: readItem.options[1], isCorrect: false },
            { text: readItem.options[2], isCorrect: false },
            { text: readItem.options[3], isCorrect: false }
          ]),
          explanation: readItem.exp,
          isAiGenerated: false
        };
      }

      default:
        return {
          term: 'Lỗi mạng',
          definition: 'Câu hỏi dự phòng',
          isAiGenerated: false
        };
    }
  }
};

export const _generateFallbackData =
  ExamFallback._generateFallbackData.bind(ExamFallback);

export default ExamFallback;