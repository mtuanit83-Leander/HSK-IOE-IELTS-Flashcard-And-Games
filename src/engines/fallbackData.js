// ============================================================================
// FILE 19/85: src/engines/fallbackData.js
// NGUỒN GỐC: tang_2.js (Block 2.4 - Fallback Data Engine V1.06)
// PHIÊN BẢN: Ver 1.0
// NGÀY GIỜ NÂNG CẤP: 26/11/2026 - 05:46 (GMT+7)
// NHIỆM VỤ: Kho dữ liệu dự phòng song ngữ (Offline) EN/ZH đầy đủ Level 1-9 cho
//           cả Từ vựng & Câu văn và Máy đóng gói Cứu hộ 10/10 Mini-Games
//           (getGameReadyFallback).
//           Nâng cấp Ver 1.0:
//           1. Diệt C1: Gỡ import hỏng detectSentence, thay bằng isSentenceText()
//              nội bộ hỗ trợ chuẩn cả EN & CJK.
//           2. Diệt C5 & F2: Bổ sung trọn bộ zh.sentence (HSK 1-9), sửa phồn thể
//              "魚" -> "鱼", thêm normalizeLevelKey() chống rơi nhầm Level 9.
//           3. Diệt F1 & F3: Đủ trường meaning & truyền deck thật cho Quiz/ImageQuiz
//              (ảnh qua buildSmartImageUrl), tách bạch trap/originalTerm ở Match,
//              chuẩn hóa SpotMistake câu đúng song ngữ + chốt chặn 1-1, bổ sung
//              nhánh 'reading' phủ 10/10 Mini-Games và sạch 0 Problems tsc/checkJs.
// ============================================================================

import { shuffleArray, buildSmartImageUrl } from '../utils/helpers.js';
import { GameAlgoEngine } from './gameOfflineEngine.js';

const HANZI_REGEX = /[\u4e00-\u9fff]/;
const CJK_SENTENCE_PUNCT_REGEX = /[。？！，；]/;
const EN_SENTENCE_PUNCT_REGEX = /[.?!]/;

let _fallbackIdSeq = 0;

/**
 * Chuẩn hóa chuỗi khóa so khớp Unicode NFC (không phân biệt hoa/thường & khoảng trắng)
 * @param {any} val
 * @returns {string}
 */
const normalizeKey = (val) => {
  if (val === undefined || val === null) return '';
  const str = String(val).trim().toLowerCase();
  return typeof str.normalize === 'function' ? str.normalize('NFC') : str;
};

/**
 * Nhận diện câu văn vs từ đơn hỗ trợ song ngữ EN & ZH (thay thế detectSentence)
 * @param {any} text
 * @returns {boolean}
 */
const isSentenceText = (text) => {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (HANZI_REGEX.test(clean)) {
    const hanziCount = (clean.match(/[\u4e00-\u9fff]/g) || []).length;
    return CJK_SENTENCE_PUNCT_REGEX.test(clean) || hanziCount >= 5;
  }
  const wordCount = clean.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 || EN_SENTENCE_PUNCT_REGEX.test(clean);
};

/**
 * Chuẩn hóa mọi biến thể cấp độ ('level_4', 'level_4_discovery_basic', ['en_level_4'], 'HSK 4', 4...)
 * về đúng khóa chuẩn '${safeLang}_level_${1..9}' — chặn triệt để việc rơi nhầm sang Level 9.
 * @param {'en' | 'zh'} safeLang
 * @param {any} levelInput
 * @returns {string}
 */
const normalizeLevelKey = (safeLang, levelInput) => {
  let raw = levelInput;
  if (Array.isArray(raw)) {
    raw = raw.find((item) => item !== null && item !== undefined && String(item).trim() !== '');
  }
  const str = String(raw || '').trim().toLowerCase();
  const numMatch = str.match(/([1-9])/);
  const num = numMatch ? Math.max(1, Math.min(9, parseInt(numMatch[1], 10))) : 1;
  return `${safeLang}_level_${num}`;
};

/**
 * Trả về bộ thẻ cứu hộ tối thiểu song ngữ chuẩn khi kho bị rỗng bất thường
 * @param {'en' | 'zh'} safeLang
 * @param {'vocab' | 'sentence'} mode
 * @returns {Array<{ term: string, definition: string }>}
 */
const getHardcodedBasePool = (safeLang, mode) => {
  if (safeLang === 'zh') {
    if (mode === 'sentence') {
      return [
        { term: '我喜欢学习汉语。', definition: 'Tôi thích học tiếng Hán.' },
        { term: '她每天都去学校。', definition: 'Cô ấy ngày nào cũng đi học.' },
        { term: '今天天气很好。', definition: 'Thời tiết hôm nay rất đẹp.' },
        { term: '我每天都喝一杯牛奶。', definition: 'Ngày nào tôi cũng uống một cốc sữa.' },
        { term: '我们一起去公园吧。', definition: 'Chúng ta cùng nhau đi công viên nhé.' }
      ];
    }
    return [
      { term: '苹果', definition: 'quả táo' },
      { term: '西瓜', definition: 'dưa hấu' },
      { term: '猫', definition: 'con mèo' },
      { term: '狗', definition: 'con chó' },
      { term: '牛奶', definition: 'sữa bò' },
      { term: '老师', definition: 'giáo viên' }
    ];
  }

  if (mode === 'sentence') {
    return [
      { term: 'The children are playing in the park.', definition: 'Bọn trẻ đang chơi trong công viên.' },
      { term: 'She goes to school every day.', definition: 'Cô ấy đi học mỗi ngày.' },
      { term: 'Learning languages is very fun.', definition: 'Học ngôn ngữ rất thú vị.' },
      { term: 'I like to read books in the library.', definition: 'Tôi thích đọc sách ở thư viện.' },
      { term: 'We protect the environment together.', definition: 'Chúng ta cùng nhau bảo vệ môi trường.' }
    ];
  }

  return [
    { term: 'apple', definition: 'quả táo' },
    { term: 'banana', definition: 'quả chuối' },
    { term: 'cat', definition: 'con mèo' },
    { term: 'dog', definition: 'con chó' },
    { term: 'bird', definition: 'con chim' },
    { term: 'book', definition: 'cuốn sách' }
  ];
};

/**
 * Chốt chặn cuối song ngữ cho SpotMistake đảm bảo wrongWord !== correction & khớp 1-1
 * @param {'en' | 'zh'} safeLang
 */
const getHardcodedSpotMistake = (safeLang) => {
  if (safeLang === 'zh') {
    return {
      wrongSentence: '我每天都吃一杯牛奶。',
      wrongWord: '吃',
      correction: '喝',
      explanation: 'Động từ đi với "牛奶" (sữa) phải là "喝" (uống), không dùng "吃" (ăn).',
      hint: 'Ngày nào tôi cũng uống một cốc sữa.',
      origin: {
        term: '我每天都喝一杯牛奶。',
        definition: 'Ngày nào tôi cũng uống một cốc sữa.',
        _isRescued: true
      },
      isAiGenerated: false,
      _isRescued: true
    };
  }
  return {
    wrongSentence: 'The childrens are playing in the park.',
    wrongWord: 'childrens',
    correction: 'children',
    explanation: 'Danh từ số nhiều bất quy tắc của "child" là "children", không thêm "s".',
    hint: 'Bọn trẻ đang chơi trong công viên.',
    origin: {
      term: 'The children are playing in the park.',
      definition: 'Bọn trẻ đang chơi trong công viên.',
      _isRescued: true
    },
    isAiGenerated: false,
    _isRescued: true
  };
};

export const FallbackDataEngine = {
  // --- PHÂN HỆ TIẾNG ANH (ENGLISH) ---
  en: {
    vocab: {
      en_level_1: [
        { term: 'cat', definition: 'con mèo' }, { term: 'dog', definition: 'con chó' }, { term: 'bird', definition: 'con chim' }, { term: 'fish', definition: 'con cá' },
        { term: 'sun', definition: 'mặt trời' }, { term: 'moon', definition: 'mặt trăng' }, { term: 'star', definition: 'ngôi sao' }, { term: 'sky', definition: 'bầu trời' },
        { term: 'water', definition: 'nước' }, { term: 'fire', definition: 'lửa' }, { term: 'tree', definition: 'cái cây' }, { term: 'flower', definition: 'bông hoa' },
        { term: 'house', definition: 'ngôi nhà' }, { term: 'car', definition: 'xe hơi' }, { term: 'book', definition: 'cuốn sách' }, { term: 'pen', definition: 'cái bút' },
        { term: 'apple', definition: 'quả táo' }, { term: 'banana', definition: 'quả chuối' }, { term: 'milk', definition: 'sữa' }, { term: 'bread', definition: 'bánh mì' }
      ],
      en_level_2: [
        { term: 'school', definition: 'trường học' }, { term: 'teacher', definition: 'giáo viên' }, { term: 'student', definition: 'học sinh' }, { term: 'friend', definition: 'bạn bè' },
        { term: 'morning', definition: 'buổi sáng' }, { term: 'afternoon', definition: 'buổi chiều' }, { term: 'evening', definition: 'buổi tối' }, { term: 'night', definition: 'ban đêm' },
        { term: 'breakfast', definition: 'bữa sáng' }, { term: 'lunch', definition: 'bữa trưa' }, { term: 'dinner', definition: 'bữa tối' }, { term: 'clothes', definition: 'quần áo' },
        { term: 'shirt', definition: 'áo sơ mi' }, { term: 'shoes', definition: 'giày' }, { term: 'hat', definition: 'cái mũ' }, { term: 'bag', definition: 'cái túi' },
        { term: 'family', definition: 'gia đình' }, { term: 'father', definition: 'bố' }, { term: 'mother', definition: 'mẹ' }, { term: 'sister', definition: 'chị/em gái' }
      ],
      en_level_3: [
        { term: 'weather', definition: 'thời tiết' }, { term: 'sunny', definition: 'có nắng' }, { term: 'rainy', definition: 'có mưa' }, { term: 'cloudy', definition: 'nhiều mây' },
        { term: 'windy', definition: 'có gió' }, { term: 'snowy', definition: 'có tuyết' }, { term: 'hobby', definition: 'sở thích' }, { term: 'football', definition: 'bóng đá' },
        { term: 'basketball', definition: 'bóng rổ' }, { term: 'music', definition: 'âm nhạc' }, { term: 'guitar', definition: 'đàn guitar' }, { term: 'piano', definition: 'đàn piano' },
        { term: 'transport', definition: 'giao thông' }, { term: 'bus', definition: 'xe buýt' }, { term: 'train', definition: 'tàu hỏa' }, { term: 'plane', definition: 'máy bay' },
        { term: 'bicycle', definition: 'xe đạp' }, { term: 'ship', definition: 'con tàu' }, { term: 'boat', definition: 'chiếc thuyền' }, { term: 'ticket', definition: 'vé' }
      ],
      en_level_4: [
        { term: 'yesterday', definition: 'hôm qua' }, { term: 'tomorrow', definition: 'ngày mai' }, { term: 'beautiful', definition: 'xinh đẹp' }, { term: 'handsome', definition: 'đẹp trai' },
        { term: 'difficult', definition: 'khó khăn' }, { term: 'easy', definition: 'dễ dàng' }, { term: 'quickly', definition: 'nhanh chóng' }, { term: 'slowly', definition: 'chậm chạp' },
        { term: 'always', definition: 'luôn luôn' }, { term: 'sometimes', definition: 'thỉnh thoảng' }, { term: 'never', definition: 'không bao giờ' }, { term: 'usually', definition: 'thường xuyên' },
        { term: 'often', definition: 'hay, thường' }, { term: 'hospital', definition: 'bệnh viện' }, { term: 'museum', definition: 'bảo tàng' }, { term: 'library', definition: 'thư viện' },
        { term: 'park', definition: 'công viên' }, { term: 'garden', definition: 'khu vườn' }, { term: 'forest', definition: 'khu rừng' }, { term: 'river', definition: 'dòng sông' }
      ],
      en_level_5: [
        { term: 'environment', definition: 'môi trường' }, { term: 'pollution', definition: 'sự ô nhiễm' }, { term: 'explore', definition: 'khám phá' }, { term: 'discover', definition: 'phát hiện' },
        { term: 'invention', definition: 'phát minh' }, { term: 'scientist', definition: 'nhà khoa học' }, { term: 'technology', definition: 'công nghệ' }, { term: 'internet', definition: 'mạng internet' },
        { term: 'software', definition: 'phần mềm' }, { term: 'hardware', definition: 'phần cứng' }, { term: 'space', definition: 'không gian' }, { term: 'planet', definition: 'hành tinh' },
        { term: 'galaxy', definition: 'thiên hà' }, { term: 'universe', definition: 'vũ trụ' }, { term: 'astronaut', definition: 'phi hành gia' }, { term: 'rocket', definition: 'tên lửa' },
        { term: 'satellite', definition: 'vệ tinh' }, { term: 'telescope', definition: 'kính viễn vọng' }, { term: 'biology', definition: 'sinh học' }, { term: 'chemistry', definition: 'hóa học' }
      ],
      en_level_6: [
        { term: 'education', definition: 'giáo dục' }, { term: 'university', definition: 'đại học' }, { term: 'graduate', definition: 'tốt nghiệp' }, { term: 'knowledge', definition: 'kiến thức' },
        { term: 'tourism', definition: 'du lịch' }, { term: 'destination', definition: 'điểm đến' }, { term: 'culture', definition: 'văn hóa' }, { term: 'tradition', definition: 'truyền thống' },
        { term: 'modern', definition: 'hiện đại' }, { term: 'lifestyle', definition: 'lối sống' }, { term: 'healthy', definition: 'lành mạnh' }, { term: 'disease', definition: 'căn bệnh' },
        { term: 'medicine', definition: 'thuốc men' }, { term: 'doctor', definition: 'bác sĩ' }, { term: 'patient', definition: 'bệnh nhân' }, { term: 'symptom', definition: 'triệu chứng' },
        { term: 'treatment', definition: 'sự điều trị' }, { term: 'surgery', definition: 'phẫu thuật' }, { term: 'recovery', definition: 'sự hồi phục' }, { term: 'pharmacy', definition: 'hiệu thuốc' }
      ],
      en_level_7: [
        { term: 'urbanization', definition: 'đô thị hóa' }, { term: 'infrastructure', definition: 'cơ sở hạ tầng' }, { term: 'sustainable', definition: 'bền vững' }, { term: 'agriculture', definition: 'nông nghiệp' },
        { term: 'economy', definition: 'nền kinh tế' }, { term: 'investment', definition: 'sự đầu tư' }, { term: 'inflation', definition: 'lạm phát' }, { term: 'poverty', definition: 'sự nghèo đói' },
        { term: 'unemployment', definition: 'sự thất nghiệp' }, { term: 'government', definition: 'chính phủ' }, { term: 'policy', definition: 'chính sách' }, { term: 'election', definition: 'cuộc bầu cử' },
        { term: 'democracy', definition: 'dân chủ' }, { term: 'candidate', definition: 'ứng cử viên' }, { term: 'debate', definition: 'cuộc tranh luận' }, { term: 'negotiation', definition: 'sự đàm phán' },
        { term: 'agreement', definition: 'thỏa thuận' }, { term: 'contract', definition: 'hợp đồng' }, { term: 'treaty', definition: 'hiệp ước' }, { term: 'alliance', definition: 'liên minh' }
      ],
      en_level_8: [
        { term: 'macroeconomics', definition: 'kinh tế vĩ mô' }, { term: 'psychology', definition: 'tâm lý học' }, { term: 'behavior', definition: 'hành vi' }, { term: 'cognitive', definition: 'thuộc nhận thức' },
        { term: 'globalization', definition: 'toàn cầu hóa' }, { term: 'integration', definition: 'sự hội nhập' }, { term: 'cultural', definition: 'thuộc văn hóa' }, { term: 'diverse', definition: 'đa dạng' },
        { term: 'profound', definition: 'sâu sắc' }, { term: 'abstract', definition: 'trừu tượng' }, { term: 'theoretical', definition: 'thuộc lý thuyết' }, { term: 'hypothesis', definition: 'giả thuyết' },
        { term: 'phenomenon', definition: 'hiện tượng' }, { term: 'methodology', definition: 'phương pháp luận' }, { term: 'analytical', definition: 'mang tính phân tích' }, { term: 'empirical', definition: 'dựa trên kinh nghiệm' },
        { term: 'quantitative', definition: 'định lượng' }, { term: 'qualitative', definition: 'định tính' }, { term: 'robust', definition: 'mạnh mẽ, vững chắc' }, { term: 'valid', definition: 'hợp lệ, có giá trị' }
      ],
      en_level_9: [
        { term: 'paradigm', definition: 'mô hình, hệ chuẩn' }, { term: 'dichotomy', definition: 'sự phân đôi' }, { term: 'juxtaposition', definition: 'sự đặt cạnh nhau' }, { term: 'esoteric', definition: 'bí truyền, khó hiểu' },
        { term: 'ephemeral', definition: 'phù du, sớm nở tối tàn' }, { term: 'pragmatic', definition: 'thực dụng' }, { term: 'ubiquitous', definition: 'có mặt khắp nơi' }, { term: 'quintessential', definition: 'tinh túy, hoàn hảo nhất' },
        { term: 'myriad', definition: 'vô số' }, { term: 'catalyst', definition: 'chất xúc tác' }, { term: 'synergy', definition: 'sự hợp lực' }, { term: 'cohesive', definition: 'gắn kết, dính liền' },
        { term: 'eloquent', definition: 'hùng hồn, lưu loát' }, { term: 'articulate', definition: 'ăn nói rõ ràng' }, { term: 'rhetoric', definition: 'thuật hùng biện' }, { term: 'nuance', definition: 'sắc thái' },
        { term: 'subtle', definition: 'tinh tế, phảng phất' }, { term: 'profound', definition: 'uyên thâm, sâu sắc' }, { term: 'intrinsic', definition: 'bản chất, thực chất' }, { term: 'benevolent', definition: 'nhân từ, nhân hậu' }
      ]
    },
    sentence: {
      en_level_1: [
        { term: 'I am a boy.', definition: 'Tôi là một cậu bé.' }, { term: 'She is a girl.', definition: 'Cô ấy là một cô bé.' }, { term: 'This is a cat.', definition: 'Đây là một con mèo.' }, { term: 'That is a dog.', definition: 'Kia là một con chó.' },
        { term: 'The sun is hot.', definition: 'Mặt trời thì nóng.' }, { term: 'The sky is blue.', definition: 'Bầu trời màu xanh.' }, { term: 'I like apples.', definition: 'Tôi thích những quả táo.' }, { term: 'He likes milk.', definition: 'Cậu ấy thích sữa.' },
        { term: 'We play games.', definition: 'Chúng tôi chơi trò chơi.' }, { term: 'They read books.', definition: 'Họ đọc sách.' }, { term: 'I have a pen.', definition: 'Tôi có một cái bút.' }, { term: 'She has a book.', definition: 'Cô ấy có một cuốn sách.' },
        { term: 'The car is red.', definition: 'Chiếc xe ô tô màu đỏ.' }, { term: 'The flower is yellow.', definition: 'Bông hoa màu vàng.' }, { term: 'Water is cold.', definition: 'Nước thì lạnh.' }, { term: 'Fire is hot.', definition: 'Lửa thì nóng.' },
        { term: 'The bird can fly.', definition: 'Con chim có thể bay.' }, { term: 'The fish can swim.', definition: 'Con cá có thể bơi.' }, { term: 'I see the moon.', definition: 'Tôi nhìn thấy mặt trăng.' }, { term: 'You see the star.', definition: 'Bạn nhìn thấy ngôi sao.' }
      ],
      en_level_2: [
        { term: 'I go to school.', definition: 'Tôi đi đến trường.' }, { term: 'The teacher is kind.', definition: 'Giáo viên thì hiền lành.' }, { term: 'He is my friend.', definition: 'Cậu ấy là bạn của tôi.' }, { term: 'Good morning to you.', definition: 'Chào buổi sáng bạn.' },
        { term: 'We eat breakfast.', definition: 'Chúng tôi ăn sáng.' }, { term: 'She wears a shirt.', definition: 'Cô ấy mặc một chiếc áo sơ mi.' }, { term: 'I have red shoes.', definition: 'Tôi có đôi giày đỏ.' }, { term: 'This is my family.', definition: 'Đây là gia đình tôi.' },
        { term: 'My father is tall.', definition: 'Bố tôi cao.' }, { term: 'My mother is beautiful.', definition: 'Mẹ tôi xinh đẹp.' }, { term: 'We sleep at night.', definition: 'Chúng tôi ngủ vào ban đêm.' }, { term: 'He eats lunch.', definition: 'Cậu ấy ăn trưa.' },
        { term: 'They play outside.', definition: 'Họ chơi ở bên ngoài.' }, { term: 'She has a blue bag.', definition: 'Cô ấy có một chiếc túi màu xanh.' }, { term: 'I wear a hat.', definition: 'Tôi đội một chiếc mũ.' }, { term: 'The student reads a book.', definition: 'Học sinh đọc một cuốn sách.' },
        { term: 'We study English.', definition: 'Chúng tôi học tiếng Anh.' }, { term: 'He likes his school.', definition: 'Cậu ấy thích trường học của mình.' }, { term: 'They eat dinner.', definition: 'Họ ăn tối.' }, { term: 'I love my sister.', definition: 'Tôi yêu em gái tôi.' }
      ],
      en_level_3: [
        { term: 'The weather is sunny.', definition: 'Thời tiết có nắng.' }, { term: 'It is raining today.', definition: 'Hôm nay trời đang mưa.' }, { term: 'I like playing football.', definition: 'Tôi thích chơi bóng đá.' }, { term: 'She plays the piano.', definition: 'Cô ấy chơi đàn piano.' },
        { term: 'He rides a bicycle.', definition: 'Cậu ấy đạp xe đạp.' }, { term: 'We travel by train.', definition: 'Chúng tôi đi du lịch bằng tàu hỏa.' }, { term: 'The plane is flying.', definition: 'Máy bay đang bay.' }, { term: 'I listen to music.', definition: 'Tôi nghe nhạc.' },
        { term: 'The sky is cloudy.', definition: 'Bầu trời nhiều mây.' }, { term: 'It is very windy.', definition: 'Trời rất nhiều gió.' }, { term: 'I see a big ship.', definition: 'Tôi thấy một con tàu lớn.' }, { term: 'He buys a ticket.', definition: 'Cậu ấy mua một tấm vé.' },
        { term: 'They play basketball.', definition: 'Họ chơi bóng rổ.' }, { term: 'My hobby is reading.', definition: 'Sở thích của tôi là đọc sách.' }, { term: 'The snow is white.', definition: 'Tuyết thì màu trắng.' }, { term: 'She likes to sing.', definition: 'Cô ấy thích hát.' },
        { term: 'He plays the guitar.', definition: 'Cậu ấy chơi đàn guitar.' }, { term: 'We take the bus.', definition: 'Chúng tôi đi xe buýt.' }, { term: 'The boat is small.', definition: 'Chiếc thuyền thì nhỏ.' }, { term: 'I enjoy the sunny day.', definition: 'Tôi tận hưởng ngày nắng.' }
      ],
      en_level_4: [
        { term: 'I went to the park yesterday.', definition: 'Tôi đã đi công viên vào ngày hôm qua.' }, { term: 'We will visit the museum tomorrow.', definition: 'Chúng tôi sẽ thăm bảo tàng vào ngày mai.' }, { term: 'She sings very beautifully.', definition: 'Cô ấy hát rất hay.' }, { term: 'The test was quite difficult.', definition: 'Bài kiểm tra khá là khó.' },
        { term: 'He runs very quickly.', definition: 'Anh ấy chạy rất nhanh.' }, { term: 'I always brush my teeth.', definition: 'Tôi luôn luôn đánh răng.' }, { term: 'They sometimes play tennis.', definition: 'Họ thỉnh thoảng chơi quần vợt.' }, { term: 'I never eat fast food.', definition: 'Tôi không bao giờ ăn đồ ăn nhanh.' },
        { term: 'She usually wakes up early.', definition: 'Cô ấy thường xuyên thức dậy sớm.' }, { term: 'He often reads in the library.', definition: 'Anh ấy hay đọc sách trong thư viện.' }, { term: 'The hospital is very clean.', definition: 'Bệnh viện rất sạch sẽ.' }, { term: 'We walked in the forest.', definition: 'Chúng tôi đã đi dạo trong khu rừng.' },
        { term: 'The river is long.', definition: 'Dòng sông thì dài.' }, { term: 'The garden has many flowers.', definition: 'Khu vườn có rất nhiều hoa.' }, { term: 'It is an easy question.', definition: 'Đó là một câu hỏi dễ.' }, { term: 'He is a handsome boy.', definition: 'Cậu ấy là một chàng trai đẹp.' },
        { term: 'We walked slowly.', definition: 'Chúng tôi đã đi bộ chầm chậm.' }, { term: 'I saw him yesterday.', definition: 'Tôi đã thấy anh ấy vào ngày hôm qua.' }, { term: 'They will arrive tomorrow.', definition: 'Họ sẽ đến vào ngày mai.' }, { term: 'The library is quiet.', definition: 'Thư viện thì yên tĩnh.' }
      ],
      en_level_5: [
        { term: 'We must protect the environment.', definition: 'Chúng ta phải bảo vệ môi trường.' }, { term: 'Air pollution is a big problem.', definition: 'Ô nhiễm không khí là một vấn đề lớn.' }, { term: 'They explore the dark cave.', definition: 'Họ khám phá hang động tối tăm.' }, { term: 'He discovered a new species.', definition: 'Anh ấy đã phát hiện ra một loài mới.' },
        { term: 'The internet changed the world.', definition: 'Mạng internet đã thay đổi thế giới.' }, { term: 'Scientists study the universe.', definition: 'Các nhà khoa học nghiên cứu vũ trụ.' }, { term: 'Technology improves our lives.', definition: 'Công nghệ cải thiện cuộc sống của chúng ta.' }, { term: 'Astronauts travel in space.', definition: 'Các phi hành gia du hành trong không gian.' },
        { term: 'The rocket launched today.', definition: 'Tên lửa đã được phóng hôm nay.' }, { term: 'Earth is a beautiful planet.', definition: 'Trái Đất là một hành tinh xinh đẹp.' }, { term: 'I use software for work.', definition: 'Tôi sử dụng phần mềm cho công việc.' }, { term: 'We need new hardware.', definition: 'Chúng tôi cần phần cứng mới.' },
        { term: 'The galaxy is huge.', definition: 'Thiên hà thì khổng lồ.' }, { term: 'He looked through a telescope.', definition: 'Anh ấy đã nhìn qua một kính viễn vọng.' }, { term: 'Biology is the study of life.', definition: 'Sinh học là ngành nghiên cứu về sự sống.' }, { term: 'Chemistry is a hard subject.', definition: 'Hóa học là một môn học khó.' },
        { term: 'They invented a new machine.', definition: 'Họ đã phát minh ra một cỗ máy mới.' }, { term: 'Space exploration is exciting.', definition: 'Khám phá không gian rất thú vị.' }, { term: 'The satellite orbits the Earth.', definition: 'Vệ tinh quay quanh Trái Đất.' }, { term: 'We reduce water pollution.', definition: 'Chúng ta giảm thiểu ô nhiễm nước.' }
      ],
      en_level_6: [
        { term: 'Education is the key to success.', definition: 'Giáo dục là chìa khóa dẫn đến thành công.' }, { term: 'He graduated from university.', definition: 'Anh ấy đã tốt nghiệp đại học.' }, { term: 'They gained a lot of knowledge.', definition: 'Họ đã thu nhận được rất nhiều kiến thức.' }, { term: 'Tourism boosts the local economy.', definition: 'Du lịch thúc đẩy nền kinh tế địa phương.' },
        { term: 'Paris is a popular destination.', definition: 'Paris là một điểm đến nổi tiếng.' }, { term: 'We should respect local culture.', definition: 'Chúng ta nên tôn trọng văn hóa địa phương.' }, { term: 'They preserve ancient traditions.', definition: 'Họ bảo tồn các truyền thống cổ xưa.' }, { term: 'Modern lifestyle is very fast.', definition: 'Lối sống hiện đại diễn ra rất nhanh.' },
        { term: 'Eating healthy is important.', definition: 'Ăn uống lành mạnh là điều quan trọng.' }, { term: 'The disease spread quickly.', definition: 'Căn bệnh lây lan một cách nhanh chóng.' }, { term: 'The doctor treated the patient.', definition: 'Bác sĩ đã điều trị cho bệnh nhân.' }, { term: 'She bought medicine at the pharmacy.', definition: 'Cô ấy đã mua thuốc tại hiệu thuốc.' },
        { term: 'The surgery was successful.', definition: 'Ca phẫu thuật đã thành công.' }, { term: 'His recovery took two weeks.', definition: 'Sự hồi phục của anh ấy mất hai tuần.' }, { term: 'These are common symptoms.', definition: 'Đây là những triệu chứng phổ biến.' }, { term: 'He studies at a top university.', definition: 'Anh ấy học tại một trường đại học hàng đầu.' },
        { term: 'Cultural exchange is beneficial.', definition: 'Giao lưu văn hóa mang lại lợi ích.' }, { term: 'They enjoy the modern lifestyle.', definition: 'Họ tận hưởng lối sống hiện đại.' }, { term: 'The treatment was effective.', definition: 'Việc điều trị đã có hiệu quả.' }, { term: 'She needs a good education.', definition: 'Cô ấy cần một nền giáo dục tốt.' }
      ],
      en_level_7: [
        { term: 'Urbanization brings many challenges.', definition: 'Đô thị hóa mang lại nhiều thách thức.' }, { term: 'The city needs better infrastructure.', definition: 'Thành phố cần cơ sở hạ tầng tốt hơn.' }, { term: 'Sustainable agriculture is essential.', definition: 'Nông nghiệp bền vững là điều thiết yếu.' }, { term: 'The economy is growing steadily.', definition: 'Nền kinh tế đang tăng trưởng ổn định.' },
        { term: 'Foreign investment is increasing.', definition: 'Đầu tư nước ngoài đang gia tăng.' }, { term: 'Inflation reduces purchasing power.', definition: 'Lạm phát làm giảm sức mua.' }, { term: 'The government announced a new policy.', definition: 'Chính phủ đã công bố một chính sách mới.' }, { term: 'They debated during the election.', definition: 'Họ đã tranh luận trong suốt cuộc bầu cử.' },
        { term: 'Democracy empowers the citizens.', definition: 'Dân chủ trao quyền cho công dân.' }, { term: 'The candidate gave a great speech.', definition: 'Ứng cử viên đã có một bài phát biểu tuyệt vời.' }, { term: 'They reached a peace agreement.', definition: 'Họ đã đạt được một thỏa thuận hòa bình.' }, { term: 'The contract was signed yesterday.', definition: 'Hợp đồng đã được ký kết vào ngày hôm qua.' },
        { term: 'The treaty ended the long war.', definition: 'Hiệp ước đã kết thúc cuộc chiến tranh dài.' }, { term: 'The alliance is very strong.', definition: 'Liên minh rất vững mạnh.' }, { term: 'Poverty remains a global issue.', definition: 'Nghèo đói vẫn là một vấn đề toàn cầu.' }, { term: 'Unemployment rates are rising.', definition: 'Tỷ lệ thất nghiệp đang tăng lên.' },
        { term: 'Negotiation is a crucial skill.', definition: 'Đàm phán là một kỹ năng thiết yếu.' }, { term: 'They discussed the new treaty.', definition: 'Họ đã thảo luận về hiệp ước mới.' }, { term: 'The infrastructure was upgraded.', definition: 'Cơ sở hạ tầng đã được nâng cấp.' }, { term: 'Economic growth requires investment.', definition: 'Tăng trưởng kinh tế đòi hỏi sự đầu tư.' }
      ],
      en_level_8: [
        { term: 'Macroeconomics studies the whole economy.', definition: 'Kinh tế vĩ mô nghiên cứu toàn bộ nền kinh tế.' }, { term: 'Psychology explains human behavior.', definition: 'Tâm lý học giải thích hành vi con người.' }, { term: 'Cognitive development is a complex process.', definition: 'Phát triển nhận thức là một quá trình phức tạp.' }, { term: 'Globalization connects the entire world.', definition: 'Toàn cầu hóa kết nối toàn bộ thế giới.' },
        { term: 'Cultural integration is happening fast.', definition: 'Hội nhập văn hóa đang diễn ra nhanh chóng.' }, { term: 'Her knowledge is quite profound.', definition: 'Kiến thức của cô ấy khá là uyên thâm.' }, { term: 'The concept is highly abstract.', definition: 'Khái niệm này mang tính trừu tượng cao.' }, { term: 'They proposed a new theoretical hypothesis.', definition: 'Họ đã đề xuất một giả thuyết lý thuyết mới.' },
        { term: 'This phenomenon is rarely observed.', definition: 'Hiện tượng này hiếm khi được quan sát thấy.' }, { term: 'The research methodology is rigorous.', definition: 'Phương pháp luận nghiên cứu rất chặt chẽ.' }, { term: 'We need an analytical approach.', definition: 'Chúng ta cần một cách tiếp cận phân tích.' }, { term: 'Empirical evidence supports the claim.', definition: 'Bằng chứng thực nghiệm ủng hộ luận điểm này.' },
        { term: 'They used quantitative analysis.', definition: 'Họ đã sử dụng phân tích định lượng.' }, { term: 'Qualitative research provides deep insights.', definition: 'Nghiên cứu định tính cung cấp hiểu biết sâu sắc.' }, { term: 'The results are highly robust.', definition: 'Các kết quả là cực kỳ vững chắc.' }, { term: 'The argument is perfectly valid.', definition: 'Lập luận là hoàn toàn hợp lệ.' },
        { term: 'The cognitive load was too high.', definition: 'Khối lượng nhận thức là quá tải.' }, { term: 'They studied the behavioral patterns.', definition: 'Họ đã nghiên cứu các khuôn mẫu hành vi.' }, { term: 'The economic integration was successful.', definition: 'Quá trình hội nhập kinh tế đã thành công.' }, { term: 'His hypothesis was finally proven.', definition: 'Giả thuyết của anh ấy cuối cùng đã được chứng minh.' }
      ],
      en_level_9: [
        { term: 'This marks a major paradigm shift.', definition: 'Điều này đánh dấu một sự thay đổi hệ chuẩn lớn.' }, { term: 'The dichotomy between good and evil.', definition: 'Sự phân đôi giữa cái thiện và cái ác.' }, { term: 'The juxtaposition of the two images.', definition: 'Sự đặt cạnh nhau của hai hình ảnh.' }, { term: 'The esoteric knowledge is hard to grasp.', definition: 'Kiến thức bí truyền rất khó để nắm bắt.' },
        { term: 'Fame is often an ephemeral thing.', definition: 'Sự nổi tiếng thường là một thứ phù du.' }, { term: 'We need a more pragmatic approach.', definition: 'Chúng ta cần một cách tiếp cận thực dụng hơn.' }, { term: 'Smartphones have become ubiquitous.', definition: 'Điện thoại thông minh đã trở nên nhan nhản ở khắp nơi.' }, { term: 'He is the quintessential gentleman.', definition: 'Anh ấy là một quý ông chuẩn mực tinh túy.' },
        { term: 'There are a myriad of possibilities.', definition: 'Có vô số những khả năng có thể xảy ra.' }, { term: 'The event acted as a catalyst for change.', definition: 'Sự kiện đóng vai trò như một chất xúc tác cho sự thay đổi.' }, { term: 'The synergy between the two teams.', definition: 'Sự hợp lực giữa hai đội ngũ.' }, { term: 'They formed a cohesive argument.', definition: 'Họ đã hình thành một lập luận gắn kết.' },
        { term: 'Her speech was incredibly eloquent.', definition: 'Bài phát biểu của cô ấy cực kỳ hùng hồn.' }, { term: 'He is an articulate and thoughtful speaker.', definition: 'Anh ấy là một diễn giả ăn nói rõ ràng và sâu sắc.' }, { term: 'The rhetoric was persuasive but empty.', definition: 'Thuật hùng biện mang tính thuyết phục nhưng sáo rỗng.' }, { term: 'You must understand the cultural nuances.', definition: 'Bạn phải hiểu những sắc thái văn hóa.' },
        { term: 'There is a subtle difference here.', definition: 'Có một sự khác biệt tinh tế ở đây.' }, { term: 'The profound impact of the discovery.', definition: 'Tác động sâu sắc của sự khám phá này.' }, { term: 'Freedom is an intrinsic human right.', definition: 'Tự do là một quyền cơ bản thiết yếu của con người.' }, { term: 'His benevolent actions saved many lives.', definition: 'Hành động nhân từ của anh ấy đã cứu sống nhiều mạng người.' }
      ]
    }
  },

  // --- PHÂN HỆ TIẾNG TRUNG (CHINESE HSK 1-9: ĐỦ CẢ VOCAB & SENTENCE) ---
  zh: {
    vocab: {
      zh_level_1: [
        { term: '我', definition: 'tôi' }, { term: '你', definition: 'bạn' }, { term: '他', definition: 'anh ấy' }, { term: '她', definition: 'cô ấy' },
        { term: '我们', definition: 'chúng tôi' }, { term: '你们', definition: 'các bạn' }, { term: '他们', definition: 'họ' }, { term: '人', definition: 'người' },
        { term: '名字', definition: 'tên' }, { term: '妈妈', definition: 'mẹ' }, { term: '爸爸', definition: 'bố' }, { term: '儿子', definition: 'con trai' },
        { term: '女儿', definition: 'con gái' }, { term: '老师', definition: 'giáo viên' }, { term: '学生', definition: 'học sinh' }, { term: '朋友', definition: 'bạn bè' },
        { term: '医生', definition: 'bác sĩ' }, { term: '先生', definition: 'tiên sinh, ngài' }, { term: '小姐', definition: 'tiểu thư, cô' }, { term: '太太', definition: 'phu nhân, bà' }
      ],
      zh_level_2: [
        { term: '早上', definition: 'buổi sáng' }, { term: '晚上', definition: 'buổi tối' }, { term: '时间', definition: 'thời gian' }, { term: '事情', definition: 'sự việc' },
        { term: '考试', definition: 'bài thi' }, { term: '问题', definition: 'vấn đề' }, { term: '意思', definition: 'ý nghĩa' }, { term: '颜色', definition: 'màu sắc' },
        { term: '红色', definition: 'màu đỏ' }, { term: '白色', definition: 'màu trắng' }, { term: '黑色', definition: 'màu đen' }, { term: '身体', definition: 'cơ thể' },
        { term: '眼睛', definition: 'đôi mắt' }, { term: '苹果', definition: 'quả táo' }, { term: '西瓜', definition: 'dưa hấu' }, { term: '咖啡', definition: 'cà phê' },
        { term: '牛奶', definition: 'sữa bò' }, { term: '自行车', definition: 'xe đạp' }, { term: '汽车', definition: 'xe ô tô' }, { term: '房间', definition: 'căn phòng' }
      ],
      zh_level_3: [
        { term: '爱好', definition: 'sở thích' }, { term: '音乐', definition: 'âm nhạc' }, { term: '体育', definition: 'thể thao' }, { term: '电影', definition: 'phim ảnh' },
        { term: '节目', definition: 'chương trình' }, { term: '成绩', definition: 'thành tích' }, { term: '机会', definition: 'cơ hội' }, { term: '城市', definition: 'thành phố' },
        { term: '国家', definition: 'quốc gia' }, { term: '环境', definition: 'môi trường' }, { term: '春天', definition: 'mùa xuân' }, { term: '夏天', definition: 'mùa hè' },
        { term: '秋天', definition: 'mùa thu' }, { term: '冬天', definition: 'mùa đông' }, { term: '太阳', definition: 'mặt trời' }, { term: '月亮', definition: 'mặt trăng' },
        { term: '树', definition: 'cái cây' }, { term: '鸟', definition: 'con chim' }, { term: '鱼', definition: 'con cá' }, { term: '故事', definition: 'câu chuyện' }
      ],
      zh_level_4: [
        { term: '经验', definition: 'kinh nghiệm' }, { term: '计划', definition: 'kế hoạch' }, { term: '目的', definition: 'mục đích' }, { term: '结果', definition: 'kết quả' },
        { term: '责任', definition: 'trách nhiệm' }, { term: '态度', definition: 'thái độ' }, { term: '感情', definition: 'tình cảm' }, { term: '脾气', definition: 'tính khí' },
        { term: '性格', definition: 'tính cách' }, { term: '骄傲', definition: 'tự hào, kiêu ngạo' }, { term: '伤心', definition: 'đau lòng' }, { term: '兴奋', definition: 'hưng phấn' },
        { term: '激动', definition: 'kích động' }, { term: '普遍', definition: 'phổ biến' }, { term: '复杂', definition: 'phức tạp' }, { term: '详细', definition: 'chi tiết' },
        { term: '准确', definition: 'chính xác' }, { term: '严格', definition: 'nghiêm khắc' }, { term: '浪漫', definition: 'lãng mạn' }, { term: '幽默', definition: 'hài hước' }
      ],
      zh_level_5: [
        { term: '挑战', definition: 'thách thức' }, { term: '优势', definition: 'ưu thế' }, { term: '劣势', definition: 'yếu thế' }, { term: '趋势', definition: 'xu hướng' },
        { term: '措施', definition: 'biện pháp' }, { term: '政策', definition: 'chính sách' }, { term: '制度', definition: 'chế độ' }, { term: '权利', definition: 'quyền lợi' },
        { term: '义务', definition: 'nghĩa vụ' }, { term: '原则', definition: 'nguyên tắc' }, { term: '道德', definition: 'đạo đức' }, { term: '价值', definition: 'giá trị' },
        { term: '意义', definition: 'ý nghĩa (sâu sắc)' }, { term: '标志', definition: 'dấu hiệu, biểu tượng' }, { term: '象征', definition: 'tượng trưng' }, { term: '智慧', definition: 'trí tuệ' },
        { term: '魅力', definition: 'sức hấp dẫn' }, { term: '灵魂', definition: 'linh hồn' }, { term: '命运', definition: 'vận mệnh' }, { term: '奇迹', definition: 'kỳ tích' }
      ],
      zh_level_6: [
        { term: '垄断', definition: 'độc quyền' }, { term: '妥协', definition: 'thỏa hiệp' }, { term: '歧视', definition: 'kỳ thị' }, { term: '偏见', definition: 'thành kiến' },
        { term: '争议', definition: 'tranh nghị, tranh cãi' }, { term: '矛盾', definition: 'mâu thuẫn' }, { term: '冲突', definition: 'xung đột' }, { term: '纠纷', definition: 'tranh chấp' },
        { term: '危机', definition: 'khủng hoảng' }, { term: '灾难', definition: 'tai nạn, thảm họa' }, { term: '牺牲', definition: 'hy sinh' }, { term: '奉献', definition: 'cống hiến' },
        { term: '剥夺', definition: 'tước đoạt' }, { term: '侵犯', definition: 'xâm phạm' }, { term: '捍卫', definition: 'bảo vệ' }, { term: '辩护', definition: 'biện hộ' },
        { term: '申诉', definition: 'khiếu nại' }, { term: '谴责', definition: 'lên án' }, { term: '控告', definition: 'buộc tội, khởi kiện' }, { term: '判决', definition: 'phán quyết' }
      ],
      zh_level_7: [
        { term: '范式', definition: 'mô thức, khuôn mẫu' }, { term: '隐喻', definition: 'ẩn dụ' }, { term: '悖论', definition: 'nghịch lý' }, { term: '演绎', definition: 'diễn dịch' },
        { term: '归纳', definition: 'quy nạp' }, { term: '诠释', definition: 'giải thích, làm rõ' }, { term: '架构', definition: 'cấu trúc, kiến trúc' }, { term: '机制', definition: 'cơ chế' },
        { term: '载体', definition: 'vật mang, thể chứa' }, { term: '渊源', definition: 'nguồn gốc sâu xa' }, { term: '契机', definition: 'cơ hội, thời cơ' }, { term: '雏形', definition: 'hình dáng ban đầu' },
        { term: '蓝图', definition: 'bản thiết kế, kế hoạch' }, { term: '愿景', definition: 'tầm nhìn' }, { term: '瓶颈', definition: 'nút thắt cổ chai' }, { term: '弊端', definition: 'tệ nạn, mặt trái' },
        { term: '枢纽', definition: 'đầu mối, trung tâm' }, { term: '引擎', definition: 'động cơ' }, { term: '辐射', definition: 'bức xạ, lan tỏa' }, { term: '渗透', definition: 'thẩm thấu, xâm nhập' }
      ],
      zh_level_8: [
        { term: '斡旋', definition: 'hòa giải, dàn xếp' }, { term: '邂逅', definition: 'tình cờ gặp gỡ' }, { term: '羁绊', definition: 'ràng buộc, vướng bận' }, { term: '窠臼', definition: 'lối cũ, rập khuôn' },
        { term: '桎梏', definition: 'gông cùm, trói buộc' }, { term: '圭臬', definition: 'chuẩn mực, khuôn vàng thước ngọc' }, { term: '滥觞', definition: 'nguồn gốc, sự bắt đầu' }, { term: '渊薮', definition: 'nơi tập trung đông đúc' },
        { term: '藩篱', definition: 'hàng rào, rào cản' }, { term: '鸿沟', definition: 'khoảng cách lớn, vực thẳm' }, { term: '芥蒂', definition: 'sự vướng bận trong lòng' }, { term: '龃龉', definition: 'bất hòa, xích mích' },
        { term: '罅隙', definition: 'khe hở, rạn nứt' }, { term: '症结', definition: 'nút thắt, điểm mấu chốt' }, { term: '积淀', definition: 'tích lũy, lắng đọng' }, { term: '沉淀', definition: 'kết tủa, lắng đọng' },
        { term: '荟萃', definition: 'hội tụ (nhân tài/vật tinh hoa)' }, { term: '砥砺', definition: 'rèn giũa, tu dưỡng' }, { term: '淬炼', definition: 'tôi luyện' }, { term: '升华', definition: 'thăng hoa' }
      ],
      zh_level_9: [
        { term: '浩瀚', definition: 'bao la, bát ngát' }, { term: '磅礴', definition: 'hùng vĩ, hoành tráng' }, { term: '恢弘', definition: 'rộng lớn, hào hùng' }, { term: '璀璨', definition: 'rực rỡ, lấp lánh' },
        { term: '斑斓', definition: 'sặc sỡ, rực rỡ' }, { term: '瑰丽', definition: 'tráng lệ, lộng lẫy' }, { term: '旖旎', definition: 'tươi đẹp, thướt tha' }, { term: '隽永', definition: 'sâu xa, đầy ý nghĩa' },
        { term: '空灵', definition: 'trống trải, thanh tao' }, { term: '澄澈', definition: 'trong vắt, sáng trong' }, { term: '缥缈', definition: 'hư ảo, mờ mịt' }, { term: '婉约', definition: 'uyển chuyển, nhẹ nhàng' },
        { term: '粗犷', definition: 'thô mộc, hào sảng' }, { term: '豪放', definition: 'phóng khoáng, hào sảng' }, { term: '雄浑', definition: 'hùng hồn, mạnh mẽ' }, { term: '悲壮', definition: 'bi tráng' },
        { term: '苍凉', definition: 'thê lương, hoang vắng' }, { term: '凄美', definition: 'bi thương và đẹp đẽ' }, { term: '哀婉', definition: 'bi ai, thê lương' }, { term: '缠绵', definition: 'triền miên, day dứt' }
      ]
    },
    sentence: {
      zh_level_1: [
        { term: '我叫小明，我是学生。', definition: 'Tôi tên là Tiểu Minh, tôi là học sinh.' },
        { term: '她是我们的汉语老师。', definition: 'Cô ấy là giáo viên tiếng Hán của chúng tôi.' },
        { term: '我喜欢喝茶和吃苹果。', definition: 'Tôi thích uống trà và ăn táo.' },
        { term: '今天天气很好，不冷也不热。', definition: 'Hôm nay thời tiết rất đẹp, không lạnh cũng không nóng.' },
        { term: '我爸爸在医院工作，他是医生。', definition: 'Bố tôi làm việc ở bệnh viện, ông ấy là bác sĩ.' },
        { term: '妈妈在家里做饭，我帮她。', definition: 'Mẹ đang nấu cơm ở nhà, tôi giúp mẹ.' },
        { term: '这是我的书，那是你的本子。', definition: 'Đây là sách của tôi, kia là vở của bạn.' },
        { term: '我们明天上午去学校看书。', definition: 'Sáng mai chúng tôi đến trường đọc sách.' },
        { term: '你认识前面那位先生吗？', definition: 'Bạn có quen vị tiên sinh ở phía trước không?' },
        { term: '我家里有四口人，我爱我的家。', definition: 'Nhà tôi có bốn người, tôi yêu gia đình mình.' },
        { term: '他每天早上七点起床学习。', definition: 'Cậu ấy dậy học lúc bảy giờ sáng mỗi ngày.' },
        { term: '谢谢你帮助我学习汉字。', definition: 'Cảm ơn bạn đã giúp tôi học chữ Hán.' },
        { term: '桌子上面有三本汉语书。', definition: 'Trên bàn có ba cuốn sách tiếng Hán.' },
        { term: '我女儿今年八岁了，很聪明。', definition: 'Con gái tôi năm nay tám tuổi rồi, rất thông minh.' },
        { term: '我们是好朋友，常常一起玩。', definition: 'Chúng tôi là bạn tốt, thường xuyên chơi cùng nhau.' }
      ],
      zh_level_2: [
        { term: '我每天早上都喝一杯热牛奶。', definition: 'Mỗi sáng tôi đều uống một cốc sữa nóng.' },
        { term: '他骑自行车去学校，非常方便。', definition: 'Cậu ấy đạp xe đạp đến trường, vô cùng tiện lợi.' },
        { term: '明天的汉语考试一点儿也不难。', definition: 'Bài thi tiếng Hán ngày mai chẳng khó chút nào.' },
        { term: '这个房间又大又干净，我很喜欢。', definition: 'Căn phòng này vừa rộng vừa sạch, tôi rất thích.' },
        { term: '我最喜欢的颜色是白色和红色。', definition: 'Màu sắc tôi thích nhất là màu trắng và màu đỏ.' },
        { term: '晚上吃完饭以后，我们去散步吧。', definition: 'Buổi tối sau khi ăn cơm xong, chúng ta đi dạo nhé.' },
        { term: '今天我有一件很重要的事情要办。', definition: 'Hôm nay tôi có một việc rất quan trọng cần làm.' },
        { term: '请问，这句话是什么意思？', definition: 'Xin hỏi, câu này có ý nghĩa là gì?' },
        { term: '你每天看电脑时间太长，对眼睛不好。', definition: 'Bạn xem máy tính mỗi ngày quá lâu, không tốt cho mắt.' },
        { term: '夏天我最喜欢吃冰凉的西瓜。', definition: 'Mùa hè tôi thích ăn dưa hấu mát lạnh nhất.' },
        { term: '爸爸买了一辆新汽车，带我们去旅游。', definition: 'Bố đã mua một chiếc ô tô mới, đưa chúng tôi đi du lịch.' },
        { term: '时间过得真快，已经到了周末。', definition: 'Thời gian trôi thật nhanh, đã đến cuối tuần rồi.' },
        { term: '早睡早起对身体健康很有帮助。', definition: 'Ngủ sớm dậy sớm rất có ích cho sức khỏe cơ thể.' },
        { term: '她喝完咖啡以后就开始工作了。', definition: 'Cô ấy uống xong cà phê liền bắt đầu làm việc.' },
        { term: '如果你有问题，可以随时问老师。', definition: 'Nếu bạn có vấn đề gì, có thể hỏi giáo viên bất cứ lúc nào.' }
      ],
      zh_level_3: [
        { term: '我的爱好是听音乐和看电影。', definition: 'Sở thích của tôi là nghe nhạc và xem phim.' },
        { term: '只要努力学习，成绩一定会提高。', definition: 'Chỉ cần chăm chỉ học tập, thành tích nhất định sẽ tiến bộ.' },
        { term: '我们应该保护城市里的自然环境。', definition: 'Chúng ta nên bảo vệ môi trường tự nhiên trong thành phố.' },
        { term: '春天到了，公园里的花都开了。', definition: 'Mùa xuân đến rồi, hoa trong công viên đều đã nở.' },
        { term: '冬天这里经常下雪，景色很美。', definition: 'Mùa đông ở đây thường xuyên có tuyết rơi, phong cảnh rất đẹp.' },
        { term: '每天坚持体育锻炼让我更有精神。', definition: 'Kiên trì rèn luyện thể thao mỗi ngày giúp tôi có thêm tinh thần.' },
        { term: '这是一个难得的机会，你一定要抓住。', definition: 'Đây là một cơ hội hiếm có, bạn nhất định phải nắm bắt.' },
        { term: '树上的小鸟每天早上都在唱歌。', definition: 'Chú chim nhỏ trên cây sáng nào cũng đang hót.' },
        { term: '清澈的小河里有许多游来游去的鱼。', definition: 'Trong dòng suối trong vắt có rất nhiều cá đang bơi qua bơi lại.' },
        { term: '奶奶经常给我们讲有趣的老故事。', definition: 'Bà nội thường kể cho chúng tôi nghe những câu chuyện xưa thú vị.' },
        { term: '今晚的电视节目非常精彩，别错过了。', definition: 'Chương trình truyền hình tối nay vô cùng đặc sắc, đừng bỏ lỡ.' },
        { term: '秋天的月亮又圆又亮，非常迷人。', definition: 'Mặt trăng mùa thu vừa tròn vừa sáng, vô cùng cuốn hút.' },
        { term: '我打算明年去不同的国家旅游。', definition: 'Tôi dự định sang năm đi du lịch ở những quốc gia khác nhau.' },
        { term: '太阳出来以后，天气慢慢暖和了。', definition: 'Sau khi mặt trời mọc, thời tiết dần dần ấm lên.' },
        { term: '虽然任务很难，但是他没有放弃。', definition: 'Mặc dù nhiệm vụ rất khó, nhưng anh ấy không bỏ cuộc.' }
      ],
      zh_level_4: [
        { term: '通过这次实习，我积累了宝贵的经验。', definition: 'Thông qua kỳ thực tập này, tôi đã tích lũy được kinh nghiệm quý báu.' },
        { term: '无论做什么事情，我们都应该提前做好计划。', definition: 'Dù làm bất cứ việc gì, chúng ta đều nên lập kế hoạch trước.' },
        { term: '他对待工作的态度非常认真负责。', definition: 'Thái độ của anh ấy đối với công việc vô cùng nghiêm túc và có trách nhiệm.' },
        { term: '虽然问题很复杂，但我们可以一步步解决。', definition: 'Tuy vấn đề rất phức tạp, nhưng chúng ta có thể giải quyết từng bước một.' },
        { term: '老师详细地介绍了这次活动的安排。', definition: 'Giáo viên đã giới thiệu chi tiết lịch trình của hoạt động lần này.' },
        { term: '她性格开朗又幽默，大家都很喜欢她。', definition: 'Tính cách cô ấy cởi mở lại hài hước, mọi người đều rất quý cô ấy.' },
        { term: '听到比赛获奖的消息，大家都非常兴奋。', definition: 'Nghe tin cuộc thi đoạt giải, mọi người đều vô cùng phấn khích.' },
        { term: '做实验时，每个数据都必须非常准确。', definition: 'Khi làm thí nghiệm, mỗi số liệu đều phải cực kỳ chính xác.' },
        { term: '父母对我的要求虽然严格，但都是为了我好。', definition: 'Yêu cầu của bố mẹ đối với tôi tuy nghiêm khắc, nhưng đều là vì tốt cho tôi.' },
        { term: '经过大家的共同努力，结果比预想的还要好。', definition: 'Nhờ sự nỗ lực chung của mọi người, kết quả còn tốt hơn dự kiến.' },
        { term: '我们之间的深厚感情不会因为距离而改变。', definition: 'Tình cảm sâu đậm giữa chúng ta sẽ không thay đổi vì khoảng cách.' },
        { term: '你不必为一次失败感到伤心，下次会更好。', definition: 'Bạn không cần cảm thấy buồn vì một lần thất bại, lần sau sẽ tốt hơn.' },
        { term: '随着科技的发展，智能手机已经非常普遍了。', definition: 'Cùng với sự phát triển của công nghệ, điện thoại thông minh đã rất phổ biến.' },
        { term: '父母为孩子的进步感到由衷的骄傲。', definition: 'Cha mẹ cảm thấy tự hào tận đáy lòng trước sự tiến bộ của con cái.' },
        { term: '我们做这个项目的目的是帮助更多学生。', definition: 'Mục đích chúng tôi làm dự án này là giúp đỡ nhiều học sinh hơn.' }
      ],
      zh_level_5: [
        { term: '面对新的挑战，我们要保持冷静和信心。', definition: 'Đối mặt với thách thức mới, chúng ta phải giữ bình tĩnh và tự tin.' },
        { term: '在激烈的竞争中，创新是企业最大的优势。', definition: 'Trong cạnh tranh khốc liệt, đổi mới là ưu thế lớn nhất của doanh nghiệp.' },
        { term: '绿色能源的发展已经成为全球不可逆转的趋势。', definition: 'Phát triển năng lượng xanh đã trở thành xu hướng không thể đảo ngược trên toàn cầu.' },
        { term: '政府采取了一系列有效措施来改善空气质量。', definition: 'Chính phủ đã áp dụng hàng loạt biện pháp hiệu quả để cải thiện chất lượng không khí.' },
        { term: '每个公民在享有权利的同时也要履行义务。', definition: 'Mỗi công dân khi hưởng quyền lợi đồng thời cũng phải thực hiện nghĩa vụ.' },
        { term: '诚信是一个人立身处世最基本的道德原则。', definition: 'Chữ tín là nguyên tắc đạo đức cơ bản nhất để một người sống ở đời.' },
        { term: '这部经典电影至今仍然具有深刻的社会意义。', definition: 'Bộ phim kinh điển này đến nay vẫn mang ý nghĩa xã hội sâu sắc.' },
        { term: '和平鸽在许多文化中都是和平的象征。', definition: 'Chim bồ câu trong nhiều nền văn hóa đều là biểu tượng của hòa bình.' },
        { term: '人类的智慧能够克服看似不可能的困难。', definition: 'Trí tuệ con người có thể vượt qua những khó khăn tưởng chừng không thể.' },
        { term: '这座古城独特的建筑风格充满了历史魅力。', definition: 'Phong cách kiến trúc độc đáo của cổ trấn này tràn đầy sức hút lịch sử.' },
        { term: '新政策的实施大大减轻了中小企业的负担。', definition: 'Việc thực thi chính sách mới đã giảm nhẹ đáng kể gánh nặng cho doanh nghiệp vừa và nhỏ.' },
        { term: '完善的制度能够保证团队高效而公平地运作。', definition: 'Chế độ hoàn thiện có thể đảm bảo đội ngũ vận hành hiệu quả và công bằng.' },
        { term: '我们要充分发挥长处，同时努力克服劣势。', definition: 'Chúng ta phải phát huy tối đa điểm mạnh, đồng thời nỗ lực khắc phục điểm yếu.' },
        { term: '经过多年的坚持，他们终于创造了令人惊叹的奇迹。', definition: 'Sau nhiều năm kiên trì, họ cuối cùng đã tạo nên kỳ tích đáng kinh ngạc.' },
        { term: '真正决定命运的，往往是我们每天做出的选择。', definition: 'Thứ thực sự quyết định vận mệnh thường là những lựa chọn ta đưa ra mỗi ngày.' }
      ],
      zh_level_6: [
        { term: '反垄断法的出台有效维护了市场的公平竞争。', definition: 'Luật chống độc quyền ra đời đã bảo vệ hiệu quả sự cạnh tranh công bằng của thị trường.' },
        { term: '在谈判陷入僵局时，双方都需要做出适当的妥协。', definition: 'Khi đàm phán rơi vào bế tắc, cả hai bên đều cần có sự thỏa hiệp thích đáng.' },
        { term: '消除社会偏见和歧视需要长期的教育与引导。', definition: 'Xóa bỏ thành kiến và kỳ thị xã hội đòi hỏi sự giáo dục và dẫn dắt lâu dài.' },
        { term: '这项提案在会议上引发了极为激烈的争议。', definition: 'Đề xuất này đã dấy lên cuộc tranh cãi vô cùng gay gắt tại cuộc họp.' },
        { term: '如果不及时化解矛盾，小冲突也可能演变成危机。', definition: 'Nếu không hóa giải mâu thuẫn kịp thời, xung đột nhỏ cũng có thể biến thành khủng hoảng.' },
        { term: '许多科研人员默默奉献，为国家发展做出了巨大贡献。', definition: 'Nhiều nhà nghiên cứu khoa học âm thầm cống hiến, đóng góp to lớn cho sự phát triển đất nước.' },
        { term: '任何个人或组织都不得随意侵犯他人的合法权益。', definition: 'Bất kỳ cá nhân hay tổ chức nào cũng không được tùy tiện xâm phạm quyền lợi hợp pháp của người khác.' },
        { term: '律师在法庭上用确凿的证据为当事人进行了辩护。', definition: 'Luật sư đã dùng bằng chứng xác thực để biện hộ cho thân chủ trước tòa.' },
        { term: '国际社会对这种破坏生态平衡的行为予以强烈谴责。', definition: 'Cộng đồng quốc tế lên án mạnh mẽ hành vi phá hoại cân bằng sinh thái này.' },
        { term: '面对突如其来的自然灾难，各地群众迅速展开救援。', definition: 'Đối mặt với thảm họa thiên nhiên bất ngờ, người dân khắp nơi nhanh chóng triển khai cứu hộ.' },
        { term: '公正的判决不仅维护了法律尊严，也赢得了公众信任。', definition: 'Phán quyết công tâm không chỉ bảo vệ sự tôn nghiêm của pháp luật mà còn giành được niềm tin của công chúng.' },
        { term: '我们应当坚定地捍卫科学真理与学术诚信。', definition: 'Chúng ta nên kiên định bảo vệ chân lý khoa học và sự liêm chính học thuật.' },
        { term: '为了解决商业纠纷，两家公司决定申请仲裁。', definition: 'Để giải quyết tranh chấp thương mại, hai công ty quyết định yêu cầu trọng tài.' },
        { term: '谁也无权剥夺儿童接受基础教育的权利。', definition: 'Không ai có quyền tước đoạt quyền được tiếp nhận giáo dục cơ bản của trẻ em.' },
        { term: '如果对处理结果有异议，你可以依法提出申诉。', definition: 'Nếu có ý kiến khác về kết quả xử lý, bạn có thể khiếu nại theo pháp luật.' }
      ],
      zh_level_7: [
        { term: '人工智能的兴起正推动科研范式发生深刻变革。', definition: 'Sự trỗi dậy của trí tuệ nhân tạo đang thúc đẩy sự biến đổi sâu sắc trong mô thức nghiên cứu khoa học.' },
        { term: '作者在作品中巧妙地运用隐喻来揭示人性弱点。', definition: 'Tác giả đã vận dụng ẩn dụ một cách khéo léo trong tác phẩm để phơi bày điểm yếu của nhân tính.' },
        { term: '这项研究综合运用了归纳法与演绎法来验证假设。', definition: 'Nghiên cứu này vận dụng tổng hợp phương pháp quy nạp và diễn dịch để kiểm chứng giả thuyết.' },
        { term: '为了突破技术瓶颈，研发团队重新设计了系统架构。', definition: 'Để đột phá nút thắt công nghệ, đội ngũ nghiên cứu đã thiết kế lại kiến trúc hệ thống.' },
        { term: '建立长效反馈机制有助于及时发现并修正弊端。', definition: 'Thiết lập cơ chế phản hồi dài hạn giúp kịp thời phát hiện và khắc phục các mặt trái.' },
        { term: '语言不仅是交流的工具，更是文化传承的重要载体。', definition: 'Ngôn ngữ không chỉ là công cụ giao tiếp mà còn là vật mang quan trọng của sự kế thừa văn hóa.' },
        { term: '这座港口城市凭借地理优势成为了区域贸易枢纽。', definition: 'Thành phố cảng này nhờ ưu thế địa lý đã trở thành đầu mối thương mại khu vực.' },
        { term: '数字经济正成为驱动全球增长的新引擎。', definition: 'Kinh tế số đang trở thành động cơ mới thúc đẩy tăng trưởng toàn cầu.' },
        { term: '经过多轮论证，宏伟的发展蓝图终于初具雏形。', definition: 'Sau nhiều vòng luận chứng, bản thiết kế phát triển hùng vĩ cuối cùng đã có hình dáng ban đầu.' },
        { term: '这次跨界合作为传统行业转型提供了难得的契机。', definition: 'Cuộc hợp tác liên ngành này đã mang lại thời cơ hiếm có cho sự chuyển đổi của ngành truyền thống.' },
        { term: '这一历史现象的渊源可以追溯到数百年前。', definition: 'Nguồn gốc sâu xa của hiện tượng lịch sử này có thể truy ngược về hàng trăm năm trước.' },
        { term: '核心城市的发展成果正不断向周边地区辐射。', definition: 'Thành quả phát triển của đô thị hạt nhân đang không ngừng lan tỏa ra các khu vực lân cận.' },
        { term: '学者们对这部古典文献进行了全新的现代诠释。', definition: 'Các học giả đã đưa ra sự diễn giải hiện đại hoàn toàn mới cho tài liệu cổ điển này.' },
        { term: '看似矛盾的悖论往往隐藏着更深层次的逻辑规律。', definition: 'Những nghịch lý tưởng chừng mâu thuẫn thường ẩn giấu quy luật logic ở tầng sâu hơn.' },
        { term: '绿色低碳的理念已经悄然渗透到日常生活的方方面面。', definition: 'Quan niệm xanh và ít carbon đã âm thầm thẩm thấu vào mọi mặt của đời sống thường nhật.' }
      ],
      zh_level_8: [
        { term: '经过多方外交斡旋，紧张的地区局势终于有所缓和。', definition: 'Nhờ sự hòa giải ngoại giao từ nhiều phía, tình hình khu vực căng thẳng cuối cùng đã phần nào dịu xuống.' },
        { term: '只有敢于打破陈旧的窠臼，艺术创作才能焕发生机。', definition: 'Chỉ khi dám phá vỡ những lối mòn rập khuôn, sáng tạo nghệ thuật mới có thể bừng lên sức sống.' },
        { term: '我们必须精准找到问题的症结，才能对症下药。', definition: 'Chúng ta phải tìm ra chính xác điểm mấu chốt của vấn đề mới có thể kê đúng thuốc.' },
        { term: '深厚的文化积淀赋予了这座城市独特的精神气质。', definition: 'Sự tích lũy văn hóa sâu dày đã mang lại cho thành phố này khí chất tinh thần độc đáo.' },
        { term: '本次峰会荟萃了来自世界各地的顶尖科学家。', definition: 'Hội nghị thượng đỉnh lần này hội tụ các nhà khoa học hàng đầu đến từ khắp nơi trên thế giới.' },
        { term: '青年一代应当在实践中不断砥砺品格、锤炼本领。', definition: 'Thế hệ trẻ nên không ngừng rèn giũa phẩm cách và trui rèn năng lực trong thực tiễn.' },
        { term: '消除学科之间的藩篱是推动交叉创新的关键一步。', definition: 'Xóa bỏ hàng rào giữa các ngành học là bước then chốt thúc đẩy đổi mới liên ngành.' },
        { term: '数字鸿沟如果不加弥合，将会加剧教育资源的不平等。', definition: 'Nếu khoảng cách số không được thu hẹp, sự bất bình đẳng về tài nguyên giáo dục sẽ trầm trọng thêm.' },
        { term: '两位老友坦诚相待，彻底消除了心中多年的芥蒂。', definition: 'Hai người bạn cũ thẳng thắn với nhau, xóa bỏ hoàn toàn sự vướng bận nhiều năm trong lòng.' },
        { term: '在困境中历经淬炼，他的思想与格局得到了全面升华。', definition: 'Trải qua tôi luyện trong nghịch cảnh, tư tưởng và tầm vóc của anh ấy đã được thăng hoa toàn diện.' },
        { term: '摆脱教条主义的桎梏，研究工作才能真正贴近现实。', definition: 'Thoát khỏi sự trói buộc của chủ nghĩa giáo điều, công tác nghiên cứu mới thực sự sát với thực tiễn.' },
        { term: '这场意外的邂逅开启了一段跨越国界的学术合作。', definition: 'Cuộc tình cờ gặp gỡ này đã mở ra một chặng đường hợp tác học thuật xuyên biên giới.' },
        { term: '客观与严谨始终是新闻从业者奉为圭臬的准则。', definition: 'Khách quan và chặt chẽ luôn là chuẩn mực được người làm báo coi như khuôn vàng thước ngọc.' },
        { term: '古典园林艺术的滥觞可以上溯至先秦时期。', definition: 'Sự khởi nguồn của nghệ thuật hoa viên cổ điển có thể ngược dòng lên thời Tiên Tần.' },
        { term: '喧嚣过后，唯有经过时间沉淀的经典才能流传下来。', definition: 'Sau mọi ồn ào, chỉ những tác phẩm kinh điển lắng đọng qua thời gian mới có thể lưu truyền mãi.' }
      ],
      zh_level_9: [
        { term: '仰望浩瀚无垠的星空，人类总能感受到宇宙的壮美。', definition: 'Ngước nhìn bầu trời sao bao la vô tận, con người luôn cảm nhận được vẻ đẹp tráng lệ của vũ trụ.' },
        { term: '交响乐团以磅礴的气势演绎了这部史诗般的名作。', definition: 'Dàn nhạc giao hưởng đã trình diễn kiệt tác mang tính sử thi này với khí thế hùng vĩ.' },
        { term: '夜幕降临，江畔的灯光勾勒出璀璨夺目的城市画卷。', definition: 'Màn đêm buông xuống, ánh đèn ven sông phác họa nên bức tranh đô thị rực rỡ chói lọi.' },
        { term: '这首短诗言简意赅，却蕴含着隽永悠长的人生哲理。', definition: 'Bài thơ ngắn này lời ít ý nhiều, nhưng ẩn chứa triết lý nhân sinh sâu xa lắng đọng.' },
        { term: '山间溪水澄澈见底，倒映着两岸苍翠的松柏。', definition: 'Nước suối giữa núi trong vắt thấy đáy, soi bóng hàng tùng bách xanh biếc đôi bờ.' },
        { term: '江南水乡的风光婉约秀美，令人流连忘返。', definition: 'Phong cảnh vùng sông nước Giang Nam uyển chuyển diễm lệ khiến người ta lưu luyến không muốn rời.' },
        { term: '他的书法笔力雄浑豪放，尽显盛唐气象。', definition: 'Nét bút thư pháp của ông hùng hồn phóng khoáng, thể hiện trọn vẹn khí tượng thời Thịnh Đường.' },
        { term: '晨雾笼罩下的远山显得缥缈空灵，宛如水墨仙境。', definition: 'Ngọn núi xa trong màn sương sớm hiện lên hư ảo thanh tao, tựa như tiên cảnh thủy mặc.' },
        { term: '敦煌壁画色彩斑斓瑰丽，是人类文明的珍贵瑰宝。', definition: 'Bích họa Đôn Hoàng sắc màu rực rỡ tráng lệ, là báu vật quý giá của nền văn minh nhân loại.' },
        { term: '古道西风中的苍凉景色勾起了游子无尽的乡愁。', definition: 'Cảnh sắc hoang vắng thê lương giữa gió tây đường xưa gợi lên nỗi nhớ quê vô tận của lữ khách.' },
        { term: '这座恢弘的建筑群见证了数百年来王朝的兴衰更替。', definition: 'Quần thể kiến trúc rộng lớn hào hùng này đã chứng kiến sự hưng thịnh suy vong của bao triều đại.' },
        { term: '西北民歌虽显粗犷，却饱含着对这片土地最炽热的爱。', definition: 'Dân ca Tây Bắc tuy có vẻ thô mộc, nhưng chan chứa tình yêu nồng cháy nhất với mảnh đất này.' },
        { term: '那段悲壮的历史故事激励着无数后人奋勇前行。', definition: 'Câu chuyện lịch sử bi tráng ấy đã khích lệ biết bao thế hệ sau dũng cảm tiến bước.' },
        { term: '微风拂过湖面，岸边旖旎的春色仿佛在水中轻轻荡漾。', definition: 'Gió nhẹ lướt qua mặt hồ, sắc xuân tươi đẹp thướt tha ven bờ như khẽ rung rinh trên làn nước.' },
        { term: '二胡哀婉缠绵的旋律如泣如诉，深深打动了在场听众。', definition: 'Giai điệu đàn nhị bi ai day dứt như đang tự sự, chạm sâu vào lòng khán giả tại khán phòng.' }
      ]
    }
  },

  // --- HÀM TRÍCH XUẤT DỮ LIỆU ĐƯỢC CHẾ BIẾN CHUẨN GAME (GAME-READY FALLBACK: 10/10 MINI-GAMES) ---
  /**
   * @param {string} gameType
   * @param {string} lang
   * @param {any} level
   * @param {Record<string, any>} [config]
   */
  getGameReadyFallback: function (gameType, lang, level, config = {}) {
    const safeLang = lang === 'zh' ? 'zh' : 'en';
    const safeConfig = config && typeof config === 'object' ? config : {};
    const mode = safeConfig.dataMode === 'sentence' ? 'sentence' : 'vocab';
    const safeLevel = normalizeLevelKey(safeLang, level);

    // 1. NỐI Ô (MATCH)
    if (gameType === 'match') {
      const difficulty =
        safeConfig.difficulty || (safeConfig.hardMode ? 'hard' : 'easy');
      const targetCount = difficulty === 'hard' ? 4 : 5;
      let fbItems = this.getFallbackData(safeLang, mode, safeLevel, 16);
      if (!fbItems || fbItems.length < targetCount + 2) {
        const extra = getHardcodedBasePool(safeLang, mode);
        const existingKeys = new Set((fbItems || []).map((c) => normalizeKey(c.term)));
        fbItems = [
          ...(fbItems || []),
          ...extra.filter((c) => !existingKeys.has(normalizeKey(c.term)))
        ];
      }

      const realCards = fbItems.slice(0, targetCount).map((c) => ({
        ...c,
        _isRescued: true
      }));
      const trapCards = [];

      if (difficulty === 'hard') {
        const usedKeys = new Set(realCards.map((c) => normalizeKey(c.term)));
        const trapSources = fbItems
          .filter((c) => !usedKeys.has(normalizeKey(c.term)))
          .slice(0, 2);

        const backupTraps = getHardcodedBasePool(safeLang, mode).filter(
          (c) =>
            !usedKeys.has(normalizeKey(c.term)) &&
            !trapSources.some((t) => normalizeKey(t.term) === normalizeKey(c.term))
        );
        while (trapSources.length < 2 && backupTraps.length > 0) {
          trapSources.push(backupTraps.shift());
        }
        while (trapSources.length < 2) {
          trapSources.push(
            safeLang === 'zh'
              ? { term: `朋友${trapSources.length + 1}`, definition: `bạn bè (${trapSources.length + 1})` }
              : { term: `sample${trapSources.length + 1}`, definition: `từ mẫu (${trapSources.length + 1})` }
          );
        }

        for (let i = 0; i < trapSources.length; i++) {
          const trapSource = trapSources[i];
          let distortedTerm = '';
          let explanation = '';
          const type = isSentenceText(trapSource.term) ? 'sentence' : 'word';

          if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
            const offRes = GameAlgoEngine.DistortionEngine.offline_distort(
              trapSource.term,
              safeLang,
              type
            );
            const candidate =
              type === 'word'
                ? offRes?.wrongWord || offRes?.wrongSentence
                : offRes?.wrongSentence || offRes?.wrongWord;
            if (candidate && normalizeKey(candidate) !== normalizeKey(trapSource.term)) {
              distortedTerm = String(candidate).trim();
              explanation = offRes?.explanation || '';
            }
          }
          if (!distortedTerm) {
            distortedTerm =
              safeLang === 'zh' ? `${trapSource.term}的` : `${trapSource.term}s`;
            explanation = 'Lỗi hình thái từ (Dự phòng Offline).';
          }

          trapCards.push({
            term: trapSource.term,
            originalTerm: trapSource.term,
            distortedTerm,
            definition: trapSource.definition || 'Bẫy vô nghiệm',
            explanation: explanation || 'Lỗi hình thái từ (Dự phòng Offline).',
            sourceCard: { ...trapSource, _isRescued: true }
          });
        }
      }

      const now = Date.now();
      const leftItems = [
        ...realCards.map((c, i) => ({
          id: `left_real_${i}_${now}_${++_fallbackIdSeq}`,
          term: c.term,
          originalTerm: c.term,
          definition: c.definition || 'Không có nghĩa',
          isTrap: false,
          origin: { ...c, _isRescued: true }
        })),
        ...trapCards.map((trap, i) => ({
          id: `left_trap_${i}_${now}_${++_fallbackIdSeq}`,
          term: trap.originalTerm,
          originalTerm: trap.originalTerm,
          distortedTerm: trap.distortedTerm,
          definition: trap.definition,
          explanation: trap.explanation,
          isTrap: true,
          origin: {
            ...trap.sourceCard,
            term: trap.originalTerm,
            definition: trap.definition,
            _isRescued: true
          }
        }))
      ];

      const rightItems = [
        ...realCards.map((c, i) => ({
          id: `right_real_${i}_${now}_${++_fallbackIdSeq}`,
          term: c.term,
          originalTerm: c.term,
          isTrap: false
        })),
        ...trapCards.map((trap, i) => ({
          id: `right_trap_${i}_${now}_${++_fallbackIdSeq}`,
          term: trap.distortedTerm,
          originalTerm: trap.originalTerm,
          explanation: trap.explanation,
          isTrap: true
        }))
      ];

      const shuffleNoAdjacentTraps = (arr) => {
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

      return {
        pairs: realCards,
        leftItems: shuffleNoAdjacentTraps(leftItems),
        rightItems: shuffleNoAdjacentTraps(rightItems),
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 2. GHÉP CÂU (SCRAMBLE)
    if (gameType === 'scramble') {
      const difficulty = safeConfig.difficulty || 'easy';
      const inputMethod = safeConfig.inputMethod || 'tap';
      const fbItems = this.getFallbackData(safeLang, mode, safeLevel, 12);
      const basePool = fbItems.length > 0 ? fbItems : getHardcodedBasePool(safeLang, mode);
      const fallbackItem = {
        ...basePool[Math.floor(Math.random() * basePool.length)],
        _isRescued: true
      };

      let parts = [];
      if (inputMethod === 'tap') {
        const isChinese = safeLang === 'zh';
        const isSentence = isSentenceText(fallbackItem.term);
        const type = isSentence ? 'sentence' : 'word';
        const cleanAndLower = (textArr) =>
          textArr
            .map((p) => {
              let cleaned = String(p || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
              if (!isChinese) cleaned = cleaned.toLowerCase();
              return cleaned;
            })
            .filter((p) => p.trim() !== '');

        if (isChinese) {
          parts = Array.from(fallbackItem.term);
        } else {
          parts = isSentence ? fallbackItem.term.split(/\s+/) : Array.from(fallbackItem.term);
        }
        parts = cleanAndLower(parts);

        if (difficulty === 'hard') {
          let targetCount = 2;
          const len = parts.length;
          if (len >= 5 && len <= 10) targetCount = Math.floor(Math.random() * 2) + 4;
          else if (len > 10) targetCount = Math.floor(Math.random() * 3) + 5;

          if (GameAlgoEngine?.ScrambleNoiseEngine?.offline_getNoise) {
            const noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(
              fallbackItem.term,
              basePool,
              safeLang,
              type,
              targetCount
            );
            if (Array.isArray(noiseWords) && noiseWords.length > 0) {
              let finalNoiseWords = [];
              if (isChinese || type === 'word') {
                noiseWords.forEach((w) => {
                  const cleanW = String(w).replace(/\s/g, '');
                  finalNoiseWords.push(...Array.from(cleanW));
                });
              } else {
                finalNoiseWords = noiseWords;
              }
              finalNoiseWords = cleanAndLower(finalNoiseWords);
              finalNoiseWords = shuffleArray(finalNoiseWords).slice(0, targetCount);
              parts.push(...finalNoiseWords);
            }
          }
        }
      }
      return { origin: fallbackItem, parts, isAiGenerated: false, _isRescued: true };
    }

    // 3 & 4. TRẮC NGHIỆM (QUIZ) & ĐOÁN HÌNH (IMAGE QUIZ)
    if (gameType === 'quiz' || gameType === 'imagequiz') {
      const targetMode = gameType === 'imagequiz' ? 'vocab' : mode;
      let fbItems = this.getFallbackData(safeLang, targetMode, safeLevel, 16);
      if (fbItems.length < 5) {
        const extra = getHardcodedBasePool(safeLang, targetMode);
        const existingKeys = new Set(fbItems.map((c) => normalizeKey(c.term)));
        fbItems = [...fbItems, ...extra.filter((c) => !existingKeys.has(normalizeKey(c.term)))];
      }

      const baseCard = { ...fbItems[0], _isRescued: true };
      const isReverse = Boolean(safeConfig.isReverse || safeConfig.askMode === 'def');
      const hardMode = Boolean(safeConfig.hardMode || safeConfig.difficulty === 'hard');
      const numOptions = 4;

      const correctOptText = isReverse ? baseCard.term : baseCard.definition;
      const correctOptMeaning = isReverse ? baseCard.definition : baseCard.term;
      const correctOpt = {
        text: correctOptText,
        meaning: correctOptMeaning,
        isCorrect: true
      };

      const usedTextKeys = new Set([normalizeKey(correctOptText)]);
      const usedMeaningKeys = new Set([normalizeKey(correctOptMeaning)]);
      const distractors = [];
      const type = isSentenceText(baseCard.term) ? 'sentence' : 'word';

      // Tầng 1: Sinh đáp án nhiễu bằng OptionsEngine (truyền deck thật fbItems)
      if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
        const distTexts = GameAlgoEngine.OptionsEngine.offline_generateOptions(
          correctOptText,
          fbItems,
          safeLang,
          type,
          numOptions + 2,
          isReverse,
          hardMode
        );
        for (const rawText of distTexts || []) {
          if (distractors.length >= numOptions - 1) break;
          const cleanText = String(rawText || '').trim();
          const tKey = normalizeKey(cleanText);
          if (!tKey || usedTextKeys.has(tKey)) continue;

          const matched = fbItems.find(
            (c) => normalizeKey(isReverse ? c.term : c.definition) === tKey
          );
          const pairMeaning = matched
            ? isReverse
              ? matched.definition || ''
              : matched.term || ''
            : '';
          const mKey = normalizeKey(pairMeaning);
          if (mKey && usedMeaningKeys.has(mKey)) continue;

          usedTextKeys.add(tKey);
          if (mKey) usedMeaningKeys.add(mKey);
          distractors.push({ text: cleanText, meaning: pairMeaning, isCorrect: false });
        }
      }

      // Tầng 2: Bù trực tiếp từ fbItems để 100% có đủ 3 đáp án nhiễu kèm meaning (không sinh rác "1, 2, 3")
      if (distractors.length < numOptions - 1) {
        for (const item of fbItems.slice(1)) {
          if (distractors.length >= numOptions - 1) break;
          const optText = isReverse ? item.term : item.definition;
          const optMeaning = isReverse ? item.definition : item.term;
          const tKey = normalizeKey(optText);
          const mKey = normalizeKey(optMeaning);
          if (!tKey || usedTextKeys.has(tKey)) continue;
          if (mKey && usedMeaningKeys.has(mKey)) continue;

          usedTextKeys.add(tKey);
          if (mKey) usedMeaningKeys.add(mKey);
          distractors.push({ text: optText, meaning: optMeaning, isCorrect: false });
        }
      }

      const finalDistractors = shuffleArray(distractors.slice(0, numOptions - 1));
      const correctPos = Math.floor(Math.random() * (finalDistractors.length + 1));
      const finalOptions = [...finalDistractors];
      finalOptions.splice(correctPos, 0, correctOpt);

      if (gameType === 'imagequiz') {
        const optionsWithImages = finalOptions.map((opt) => {
          // Luôn tìm ảnh dựa trên từ Ngoại ngữ (term) thông qua buildSmartImageUrl chuẩn
          const foreignTerm = isReverse ? opt.text : opt.meaning || opt.text;
          const imageUrl =
            typeof buildSmartImageUrl === 'function'
              ? buildSmartImageUrl(foreignTerm, safeLang)
              : `https://tse2.mm.bing.net/th?q=${encodeURIComponent(
                  `${foreignTerm} illustration`
                )}&w=400&h=300&c=7&rs=1&p=0`;
          return {
            ...opt,
            image: imageUrl
          };
        });
        return {
          ...baseCard,
          question: baseCard,
          options: optionsWithImages,
          origin: baseCard,
          isAiGenerated: false,
          _isRescued: true
        };
      }

      return {
        question: baseCard,
        options: finalOptions,
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 5. ĐIỀN TỪ KHUYẾT (FILL BLANK)
    if (gameType === 'fillblank') {
      const fbItems = this.getFallbackData(safeLang, mode, safeLevel, 10);
      const basePool = fbItems.length > 0 ? fbItems : getHardcodedBasePool(safeLang, mode);
      const baseCard = { ...basePool[0], _isRescued: true };
      const type = isSentenceText(baseCard.term) ? 'sentence' : 'word';

      if (GameAlgoEngine?.ClozeEngine?.offline_mask) {
        const offRes = GameAlgoEngine.ClozeEngine.offline_mask(
          baseCard.term,
          safeLang,
          type,
          basePool
        );
        if (offRes && offRes.targetWord && offRes.displaySentence) {
          return {
            ...offRes,
            origin: baseCard,
            hint: baseCard.definition || offRes.hint || '',
            type,
            isAiGenerated: false,
            _isRescued: true
          };
        }
      }

      return {
        targetWord: baseCard.term,
        displaySentence: '[__________]',
        hint: baseCard.definition,
        origin: baseCard,
        type,
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 6. TÌM LỖI SAI (SPOT MISTAKE)
    if (gameType === 'spotmistake') {
      const targetMode = safeConfig.dataMode === 'vocab' ? 'vocab' : 'sentence';
      const fbItems = this.getFallbackData(safeLang, targetMode, safeLevel, 10);
      const basePool = fbItems.length > 0 ? fbItems : getHardcodedBasePool(safeLang, targetMode);
      const baseCard = { ...basePool[0], _isRescued: true };
      const type = isSentenceText(baseCard.term) ? 'sentence' : 'word';

      if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
        const offRes = GameAlgoEngine.DistortionEngine.offline_distort(
          baseCard.term,
          safeLang,
          type
        );
        const wrongSentence = String(
          offRes?.wrongSentence || (type === 'word' ? offRes?.wrongWord : '') || ''
        ).trim();
        const wrongWord = String(offRes?.wrongWord || wrongSentence).trim();
        const correction = String(offRes?.correction || baseCard.term).trim();

        if (
          wrongSentence &&
          wrongWord &&
          correction &&
          normalizeKey(wrongWord) !== normalizeKey(correction) &&
          wrongSentence.includes(wrongWord)
        ) {
          return {
            wrongSentence,
            wrongWord,
            correction,
            explanation: offRes?.explanation || 'Lỗi chính tả / ngữ pháp (Dự phòng Offline).',
            hint: baseCard.definition || '',
            origin: baseCard,
            isAiGenerated: false,
            _isRescued: true
          };
        }
      }

      return getHardcodedSpotMistake(safeLang);
    }

    // 7. TỪ KHÁC LOẠI (ODD ONE OUT)
    if (gameType === 'oddoneout') {
      const fbItems = this.getFallbackData(safeLang, 'vocab', safeLevel, 16);
      if (GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
        const offlineResult = GameAlgoEngine.OddOneOutEngine.offline_generate(fbItems, safeLang);
        if (offlineResult) {
          return { ...offlineResult, isAiGenerated: false, _isRescued: true };
        }
      }
      if (safeLang === 'zh') {
        return {
          words: ['苹果', '西瓜', '香蕉', '汽车'],
          oddWord: '汽车',
          explanation: '汽车 (xe ô tô) là phương tiện giao thông, các từ còn lại là trái cây (Dự phòng).',
          isAiGenerated: false,
          _isRescued: true
        };
      }
      return {
        words: ['apple', 'banana', 'orange', 'cat'],
        oddWord: 'cat',
        explanation: 'Cat là động vật, các từ còn lại là trái cây (Dự phòng).',
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 8. NGỮ ÂM (PRONUNCIATION)
    if (gameType === 'pronunciation') {
      if (safeLang === 'zh') {
        const exp = 'Chữ 吧 (ba) là thanh nhẹ, các chữ còn lại đều là thanh 1.';
        return {
          term: '妈, 吧, 哥, 喝',
          definition: exp,
          explanation: exp,
          options: shuffleArray([
            { text: '妈', isCorrect: false },
            { text: '哥', isCorrect: false },
            { text: '吧', isCorrect: true },
            { text: '喝', isCorrect: false }
          ]),
          isAiGenerated: false,
          _isRescued: true
        };
      }
      const exp = 'Từ "tall" có nguyên âm /ɔː/ khác với âm /æ/ ở các từ còn lại.';
      return {
        term: 'cat, bat, tall, map',
        definition: exp,
        explanation: exp,
        options: shuffleArray([
          { text: 'cat', isCorrect: false },
          { text: 'bat', isCorrect: false },
          { text: 'tall', isCorrect: true },
          { text: 'map', isCorrect: false }
        ]),
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 9. NGHE HIỂU (LISTENING)
    if (gameType === 'listening') {
      if (safeLang === 'zh') {
        return {
          audioScript: '你好，我叫王明。我喜欢吃苹果。',
          term: '王明喜欢吃什么？',
          options: shuffleArray([
            { text: '苹果 (Píngguǒ)', isCorrect: true },
            { text: '香蕉 (Xiāngjiāo)', isCorrect: false },
            { text: '西瓜 (Xīguā)', isCorrect: false },
            { text: '米饭 (Mǐfàn)', isCorrect: false }
          ]),
          explanation: "Trong đoạn băng, người nói nói rằng: '我喜欢吃苹果' (Tôi thích ăn táo).",
          isAiGenerated: false,
          _isRescued: true
        };
      }
      return {
        audioScript: 'Hello, my name is John. I like to eat apples and play football in the park.',
        term: 'What does John like to eat?',
        options: shuffleArray([
          { text: 'Apples', isCorrect: true },
          { text: 'Bananas', isCorrect: false },
          { text: 'Oranges', isCorrect: false },
          { text: 'Grapes', isCorrect: false }
        ]),
        explanation: "Trong đoạn băng, người nói nói rằng: 'I like to eat apples'.",
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // 10. ĐỌC HIỂU (READING — TỔ KÉN SONG NGỮ CHUẨN READINGGAME VER 1.0)
    if (gameType === 'reading') {
      if (safeLang === 'zh') {
        return {
          title: '小明的周末计划',
          passage:
            '每个周末，小明都喜欢去市图书馆看书。星期六上午，他先骑自行车去公园锻炼半个小时，然后再去图书馆学习两个小时的英语。下午，他常常和好朋友一起踢足球。',
          translation:
            'Mỗi cuối tuần, Tiểu Minh đều thích đến thư viện thành phố đọc sách. Sáng thứ Bảy, cậu ấy đạp xe ra công viên tập thể dục nửa tiếng trước, sau đó mới đến thư viện học tiếng Anh hai tiếng. Buổi chiều, cậu ấy thường đá bóng cùng bạn thân.',
          questions: [
            {
              type: 'mcq',
              question: '小明星期六上午先去哪里？',
              options: ['公园', '学校', '医院', '超市'],
              correctAnswer: '公园',
              explanation: 'Trong đoạn văn nêu rõ sáng thứ Bảy cậu ấy đi công viên tập thể dục trước.',
              evidence: '他先骑自行车去公园锻炼半个小时'
            },
            {
              type: 'tfng',
              question: '小明星期六上午在图书馆学习两个小时的英语。',
              options: ['True', 'False', 'Not Given'],
              correctAnswer: 'True',
              explanation: 'Thông tin trùng khớp hoàn toàn với câu thứ hai của đoạn văn.',
              evidence: '然后再去图书馆学习两个小时的英语'
            },
            {
              type: 'mcq',
              question: '小明星期六下午常常做什么？',
              options: ['和朋友踢足球', '在家看电影', '去买水果', '去游泳'],
              correctAnswer: '和朋友踢足球',
              explanation: 'Câu cuối cùng cho biết buổi chiều cậu ấy thường đá bóng cùng bạn thân.',
              evidence: '下午，他常常和好朋友一起踢足球'
            }
          ],
          isAiGenerated: false,
          _isRescued: true
        };
      }
      return {
        title: 'A Healthy Morning Routine',
        passage:
          'Every morning, Anna wakes up at six thirty and drinks a glass of warm water. After brushing her teeth, she jogs in the local park for twenty minutes. Before going to school, she always eats a healthy breakfast with eggs, bread, and fresh fruit.',
        translation:
          'Mỗi sáng, Anna thức dậy lúc 6 giờ 30 và uống một cốc nước ấm. Sau khi đánh răng, cô ấy chạy bộ trong công viên địa phương hai mươi phút. Trước khi đến trường, cô ấy luôn ăn một bữa sáng lành mạnh với trứng, bánh mì và trái cây tươi.',
        questions: [
          {
            type: 'mcq',
            question: 'What does Anna do right after waking up?',
            options: [
              'Drinks warm water',
              'Watches television',
              'Plays football',
              'Reads a newspaper'
            ],
            correctAnswer: 'Drinks warm water',
            explanation: 'Câu đầu tiên cho biết Anna thức dậy lúc 6:30 và uống một cốc nước ấm.',
            evidence: 'Anna wakes up at six thirty and drinks a glass of warm water'
          },
          {
            type: 'tfng',
            question: 'Anna jogs in the local park for twenty minutes every morning.',
            options: ['True', 'False', 'Not Given'],
            correctAnswer: 'True',
            explanation: 'Thông tin trùng khớp chính xác với câu thứ hai trong bài đọc.',
            evidence: 'she jogs in the local park for twenty minutes'
          },
          {
            type: 'mcq',
            question: 'Which food is NOT mentioned in Anna’s breakfast?',
            options: ['Noodles', 'Eggs', 'Bread', 'Fresh fruit'],
            correctAnswer: 'Noodles',
            explanation: 'Bữa sáng của Anna gồm trứng, bánh mì và trái cây tươi — không có mì.',
            evidence: 'a healthy breakfast with eggs, bread, and fresh fruit'
          }
        ],
        isAiGenerated: false,
        _isRescued: true
      };
    }

    // Fallback mặc định an toàn theo đúng ngôn ngữ
    const fallbackCard = getHardcodedBasePool(safeLang, mode)[0];
    return { ...fallbackCard, isAiGenerated: false, _isRescued: true };
  },

  // --- HÀM TRÍCH XUẤT DỮ LIỆU TỰ ĐỘNG (ĐỒNG CẤP AN TOÀN, CHỐNG RƠI NHẦM LEVEL 9) ---
  /**
   * @param {string} lang
   * @param {string} mode
   * @param {any} level
   * @param {number} [count]
   */
  getFallbackData: function (lang, mode, level, count = 5) {
    try {
      const safeLang = lang === 'zh' ? 'zh' : 'en';
      const safeMode = mode === 'sentence' ? 'sentence' : 'vocab';
      const safeCount = Math.max(1, Number(count) || 5);
      const safeLevel = normalizeLevelKey(safeLang, level);

      const modeObj = this[safeLang]?.[safeMode] || this[safeLang]?.vocab || {};
      let pool = modeObj[safeLevel];

      if (!Array.isArray(pool) || pool.length === 0) {
        // Ưu tiên cứu hộ cấp độ lân cận thay vì gộp thẳng Level 9 vào Lớp 4
        const levelNum = parseInt(safeLevel.match(/([1-9])/)?.[1] || '1', 10);
        for (let delta = 1; delta <= 8; delta++) {
          const lowerKey = `${safeLang}_level_${levelNum - delta}`;
          const upperKey = `${safeLang}_level_${levelNum + delta}`;
          if (Array.isArray(modeObj[lowerKey]) && modeObj[lowerKey].length > 0) {
            pool = modeObj[lowerKey];
            break;
          }
          if (Array.isArray(modeObj[upperKey]) && modeObj[upperKey].length > 0) {
            pool = modeObj[upperKey];
            break;
          }
        }
      }

      if (!Array.isArray(pool) || pool.length === 0) {
        pool = Object.values(modeObj).flat();
      }
      if (!Array.isArray(pool) || pool.length === 0) {
        pool = getHardcodedBasePool(safeLang, safeMode);
      }

      return shuffleArray([...pool]).slice(0, safeCount);
    } catch (e) {
      console.warn('[FallbackDataEngine] Extraction failed:', e);
      return getHardcodedBasePool(lang === 'zh' ? 'zh' : 'en', mode === 'sentence' ? 'sentence' : 'vocab');
    }
  }
};

// Gắn cầu nối window để tương thích ngược trong quá trình vận hành
if (typeof window !== 'undefined') {
  window.FallbackDataEngine = FallbackDataEngine;
}

export default FallbackDataEngine;