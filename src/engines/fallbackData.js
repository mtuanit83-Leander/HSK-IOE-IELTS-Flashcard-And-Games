/**
 * @file src/engines/fallbackData.js
 * @description Kho chứa dữ liệu dự phòng khổng lồ (Offline) và Máy đóng gói Dữ liệu Cứu hộ chuẩn Game (Game-ready Fallback) khi AI sập.
 * @origin Tầng 2 - Block 2.4 (Fallback Data Engine)
 */

import { Utils } from '@/utils/helpers';
import { GameAlgoEngine } from './gameOfflineEngine';

export const FallbackDataEngine = {
  // --- PHÂN HỆ TIẾNG ANH (ENGLISH) ---
  en: {
    vocab: {
      en_level_1: [
        { term: "cat", definition: "con mèo" }, { term: "dog", definition: "con chó" }, { term: "bird", definition: "con chim" }, { term: "fish", definition: "con cá" },
        { term: "sun", definition: "mặt trời" }, { term: "moon", definition: "mặt trăng" }, { term: "star", definition: "ngôi sao" }, { term: "sky", definition: "bầu trời" },
        { term: "water", definition: "nước" }, { term: "fire", definition: "lửa" }, { term: "tree", definition: "cái cây" }, { term: "flower", definition: "bông hoa" },
        { term: "house", definition: "ngôi nhà" }, { term: "car", definition: "xe hơi" }, { term: "book", definition: "cuốn sách" }, { term: "pen", definition: "cái bút" },
        { term: "apple", definition: "quả táo" }, { term: "banana", definition: "quả chuối" }, { term: "milk", definition: "sữa" }, { term: "bread", definition: "bánh mì" }
      ],
      en_level_2: [
        { term: "school", definition: "trường học" }, { term: "teacher", definition: "giáo viên" }, { term: "student", definition: "học sinh" }, { term: "friend", definition: "bạn bè" },
        { term: "morning", definition: "buổi sáng" }, { term: "afternoon", definition: "buổi chiều" }, { term: "evening", definition: "buổi tối" }, { term: "night", definition: "ban đêm" },
        { term: "breakfast", definition: "bữa sáng" }, { term: "lunch", definition: "bữa trưa" }, { term: "dinner", definition: "bữa tối" }, { term: "clothes", definition: "quần áo" },
        { term: "shirt", definition: "áo sơ mi" }, { term: "shoes", definition: "giày" }, { term: "hat", definition: "cái mũ" }, { term: "bag", definition: "cái túi" },
        { term: "family", definition: "gia đình" }, { term: "father", definition: "bố" }, { term: "mother", definition: "mẹ" }, { term: "sister", definition: "chị/em gái" }
      ],
      en_level_3: [
        { term: "weather", definition: "thời tiết" }, { term: "sunny", definition: "có nắng" }, { term: "rainy", definition: "có mưa" }, { term: "cloudy", definition: "nhiều mây" },
        { term: "windy", definition: "có gió" }, { term: "snowy", definition: "có tuyết" }, { term: "hobby", definition: "sở thích" }, { term: "football", definition: "bóng đá" },
        { term: "basketball", definition: "bóng rổ" }, { term: "music", definition: "âm nhạc" }, { term: "guitar", definition: "đàn guitar" }, { term: "piano", definition: "đàn piano" },
        { term: "transport", definition: "giao thông" }, { term: "bus", definition: "xe buýt" }, { term: "train", definition: "tàu hỏa" }, { term: "plane", definition: "máy bay" },
        { term: "bicycle", definition: "xe đạp" }, { term: "ship", definition: "con tàu" }, { term: "boat", definition: "chiếc thuyền" }, { term: "ticket", definition: "vé" }
      ],
      en_level_4: [
        { term: "yesterday", definition: "hôm qua" }, { term: "tomorrow", definition: "ngày mai" }, { term: "beautiful", definition: "xinh đẹp" }, { term: "handsome", definition: "đẹp trai" },
        { term: "difficult", definition: "khó khăn" }, { term: "easy", definition: "dễ dàng" }, { term: "quickly", definition: "nhanh chóng" }, { term: "slowly", definition: "chậm chạp" },
        { term: "always", definition: "luôn luôn" }, { term: "sometimes", definition: "thỉnh thoảng" }, { term: "never", definition: "không bao giờ" }, { term: "usually", definition: "thường xuyên" },
        { term: "often", definition: "hay, thường" }, { term: "hospital", definition: "bệnh viện" }, { term: "museum", definition: "bảo tàng" }, { term: "library", definition: "thư viện" },
        { term: "park", definition: "công viên" }, { term: "garden", definition: "khu vườn" }, { term: "forest", definition: "khu rừng" }, { term: "river", definition: "dòng sông" }
      ],
      en_level_5: [
        { term: "environment", definition: "môi trường" }, { term: "pollution", definition: "sự ô nhiễm" }, { term: "explore", definition: "khám phá" }, { term: "discover", definition: "phát hiện" },
        { term: "invention", definition: "phát minh" }, { term: "scientist", definition: "nhà khoa học" }, { term: "technology", definition: "công nghệ" }, { term: "internet", definition: "mạng internet" },
        { term: "software", definition: "phần mềm" }, { term: "hardware", definition: "phần cứng" }, { term: "space", definition: "không gian" }, { term: "planet", definition: "hành tinh" },
        { term: "galaxy", definition: "thiên hà" }, { term: "universe", definition: "vũ trụ" }, { term: "astronaut", definition: "phi hành gia" }, { term: "rocket", definition: "tên lửa" },
        { term: "satellite", definition: "vệ tinh" }, { term: "telescope", definition: "kính viễn vọng" }, { term: "biology", definition: "sinh học" }, { term: "chemistry", definition: "hóa học" }
      ],
      en_level_6: [
        { term: "education", definition: "giáo dục" }, { term: "university", definition: "đại học" }, { term: "graduate", definition: "tốt nghiệp" }, { term: "knowledge", definition: "kiến thức" },
        { term: "tourism", definition: "du lịch" }, { term: "destination", definition: "điểm đến" }, { term: "culture", definition: "văn hóa" }, { term: "tradition", definition: "truyền thống" },
        { term: "modern", definition: "hiện đại" }, { term: "lifestyle", definition: "lối sống" }, { term: "healthy", definition: "lành mạnh" }, { term: "disease", definition: "căn bệnh" },
        { term: "medicine", definition: "thuốc men" }, { term: "doctor", definition: "bác sĩ" }, { term: "patient", definition: "bệnh nhân" }, { term: "symptom", definition: "triệu chứng" },
        { term: "treatment", definition: "sự điều trị" }, { term: "surgery", definition: "phẫu thuật" }, { term: "recovery", definition: "sự hồi phục" }, { term: "pharmacy", definition: "hiệu thuốc" }
      ],
      en_level_7: [
        { term: "urbanization", definition: "đô thị hóa" }, { term: "infrastructure", definition: "cơ sở hạ tầng" }, { term: "sustainable", definition: "bền vững" }, { term: "agriculture", definition: "nông nghiệp" },
        { term: "economy", definition: "nền kinh tế" }, { term: "investment", definition: "sự đầu tư" }, { term: "inflation", definition: "lạm phát" }, { term: "poverty", definition: "sự nghèo đói" },
        { term: "unemployment", definition: "sự thất nghiệp" }, { term: "government", definition: "chính phủ" }, { term: "policy", definition: "chính sách" }, { term: "election", definition: "cuộc bầu cử" },
        { term: "democracy", definition: "dân chủ" }, { term: "candidate", definition: "ứng cử viên" }, { term: "debate", definition: "cuộc tranh luận" }, { term: "negotiation", definition: "sự đàm phán" },
        { term: "agreement", definition: "thỏa thuận" }, { term: "contract", definition: "hợp đồng" }, { term: "treaty", definition: "hiệp ước" }, { term: "alliance", definition: "liên minh" }
      ],
      en_level_8: [
        { term: "macroeconomics", definition: "kinh tế vĩ mô" }, { term: "psychology", definition: "tâm lý học" }, { term: "behavior", definition: "hành vi" }, { term: "cognitive", definition: "thuộc nhận thức" },
        { term: "globalization", definition: "toàn cầu hóa" }, { term: "integration", definition: "sự hội nhập" }, { term: "cultural", definition: "thuộc văn hóa" }, { term: "diverse", definition: "đa dạng" },
        { term: "profound", definition: "sâu sắc" }, { term: "abstract", definition: "trừu tượng" }, { term: "theoretical", definition: "thuộc lý thuyết" }, { term: "hypothesis", definition: "giả thuyết" },
        { term: "phenomenon", definition: "hiện tượng" }, { term: "methodology", definition: "phương pháp luận" }, { term: "analytical", definition: "mang tính phân tích" }, { term: "empirical", definition: "dựa trên kinh nghiệm" },
        { term: "quantitative", definition: "định lượng" }, { term: "qualitative", definition: "định tính" }, { term: "robust", definition: "mạnh mẽ, vững chắc" }, { term: "valid", definition: "hợp lệ, có giá trị" }
      ],
      en_level_9: [
        { term: "paradigm", definition: "mô hình, hệ chuẩn" }, { term: "dichotomy", definition: "sự phân đôi" }, { term: "juxtaposition", definition: "sự đặt cạnh nhau" }, { term: "esoteric", definition: "bí truyền, khó hiểu" },
        { term: "ephemeral", definition: "phù du, sớm nở tối tàn" }, { term: "pragmatic", definition: "thực dụng" }, { term: "ubiquitous", definition: "có mặt khắp nơi" }, { term: "quintessential", definition: "tinh túy, hoàn hảo nhất" },
        { term: "myriad", definition: "vô số" }, { term: "catalyst", definition: "chất xúc tác" }, { term: "synergy", definition: "sự hợp lực" }, { term: "cohesive", definition: "gắn kết, dính liền" },
        { term: "eloquent", definition: "hùng hồn, lưu loát" }, { term: "articulate", definition: "ăn nói rõ ràng" }, { term: "rhetoric", definition: "thuật hùng biện" }, { term: "nuance", definition: "sắc thái" },
        { term: "subtle", definition: "tinh tế, phảng phất" }, { term: "profound", definition: "uyên thâm, sâu sắc" }, { term: "intrinsic", definition: "bản chất, thực chất" }, { term: "benevolent", definition: " nhân từ, nhân hậu" }
      ]
    },
    sentence: {
      en_level_1: [
        { term: "I am a boy.", definition: "Tôi là một cậu bé." }, { term: "She is a girl.", definition: "Cô ấy là một cô bé." }, { term: "This is a cat.", definition: "Đây là một con mèo." }, { term: "That is a dog.", definition: "Kia là một con chó." },
        { term: "The sun is hot.", definition: "Mặt trời thì nóng." }, { term: "The sky is blue.", definition: "Bầu trời màu xanh." }, { term: "I like apples.", definition: "Tôi thích những quả táo." }, { term: "He likes milk.", definition: "Cậu ấy thích sữa." },
        { term: "We play games.", definition: "Chúng tôi chơi trò chơi." }, { term: "They read books.", definition: "Họ đọc sách." }, { term: "I have a pen.", definition: "Tôi có một cái bút." }, { term: "She has a book.", definition: "Cô ấy có một cuốn sách." },
        { term: "The car is red.", definition: "Chiếc xe ô tô màu đỏ." }, { term: "The flower is yellow.", definition: "Bông hoa màu vàng." }, { term: "Water is cold.", definition: "Nước thì lạnh." }, { term: "Fire is hot.", definition: "Lửa thì nóng." },
        { term: "The bird can fly.", definition: "Con chim có thể bay." }, { term: "The fish can swim.", definition: "Con cá có thể bơi." }, { term: "I see the moon.", definition: "Tôi nhìn thấy mặt trăng." }, { term: "You see the star.", definition: "Bạn nhìn thấy ngôi sao." }
      ],
      en_level_2: [
        { term: "I go to school.", definition: "Tôi đi đến trường." }, { term: "The teacher is kind.", definition: "Giáo viên thì hiền lành." }, { term: "He is my friend.", definition: "Cậu ấy là bạn của tôi." }, { term: "Good morning to you.", definition: "Chào buổi sáng bạn." },
        { term: "We eat breakfast.", definition: "Chúng tôi ăn sáng." }, { term: "She wears a shirt.", definition: "Cô ấy mặc một chiếc áo sơ mi." }, { term: "I have red shoes.", definition: "Tôi có đôi giày đỏ." }, { term: "This is my family.", definition: "Đây là gia đình tôi." },
        { term: "My father is tall.", definition: "Bố tôi cao." }, { term: "My mother is beautiful.", definition: "Mẹ tôi xinh đẹp." }, { term: "We sleep at night.", definition: "Chúng tôi ngủ vào ban đêm." }, { term: "He eats lunch.", definition: "Cậu ấy ăn trưa." },
        { term: "They play outside.", definition: "Họ chơi ở bên ngoài." }, { term: "She has a blue bag.", definition: "Cô ấy có một chiếc túi màu xanh." }, { term: "I wear a hat.", definition: "Tôi đội một chiếc mũ." }, { term: "The student reads a book.", definition: "Học sinh đọc một cuốn sách." },
        { term: "We study English.", definition: "Chúng tôi học tiếng Anh." }, { term: "He likes his school.", definition: "Cậu ấy thích trường học của mình." }, { term: "They eat dinner.", definition: "Họ ăn tối." }, { term: "I love my sister.", definition: "Tôi yêu em gái tôi." }
      ],
      en_level_3: [
        { term: "The weather is sunny.", definition: "Thời tiết có nắng." }, { term: "It is raining today.", definition: "Hôm nay trời đang mưa." }, { term: "I like playing football.", definition: "Tôi thích chơi bóng đá." }, { term: "She plays the piano.", definition: "Cô ấy chơi đàn piano." },
        { term: "He rides a bicycle.", definition: "Cậu ấy đạp xe đạp." }, { term: "We travel by train.", definition: "Chúng tôi đi du lịch bằng tàu hỏa." }, { term: "The plane is flying.", definition: "Máy bay đang bay." }, { term: "I listen to music.", definition: "Tôi nghe nhạc." },
        { term: "The sky is cloudy.", definition: "Bầu trời nhiều mây." }, { term: "It is very windy.", definition: "Trời rất nhiều gió." }, { term: "I see a big ship.", definition: "Tôi thấy một con tàu lớn." }, { term: "He buys a ticket.", definition: "Cậu ấy mua một tấm vé." },
        { term: "They play basketball.", definition: "Họ chơi bóng rổ." }, { term: "My hobby is reading.", definition: "Sở thích của tôi là đọc sách." }, { term: "The snow is white.", definition: "Tuyết thì màu trắng." }, { term: "She likes to sing.", definition: "Cô ấy thích hát." },
        { term: "He plays the guitar.", definition: "Cậu ấy chơi đàn guitar." }, { term: "We take the bus.", definition: "Chúng tôi đi xe buýt." }, { term: "The boat is small.", definition: "Chiếc thuyền thì nhỏ." }, { term: "I enjoy the sunny day.", definition: "Tôi tận hưởng ngày nắng." }
      ],
      en_level_4: [
        { term: "I went to the park yesterday.", definition: "Tôi đã đi công viên vào ngày hôm qua." }, { term: "We will visit the museum tomorrow.", definition: "Chúng tôi sẽ thăm bảo tàng vào ngày mai." }, { term: "She sings very beautifully.", definition: "Cô ấy hát rất hay." }, { term: "The test was quite difficult.", definition: "Bài kiểm tra khá là khó." },
        { term: "He runs very quickly.", definition: "Anh ấy chạy rất nhanh." }, { term: "I always brush my teeth.", definition: "Tôi luôn luôn đánh răng." }, { term: "They sometimes play tennis.", definition: "Họ thỉnh thoảng chơi quần vợt." }, { term: "I never eat fast food.", definition: "Tôi không bao giờ ăn đồ ăn nhanh." },
        { term: "She usually wakes up early.", definition: "Cô ấy thường xuyên thức dậy sớm." }, { term: "He often reads in the library.", definition: "Anh ấy hay đọc sách trong thư viện." }, { term: "The hospital is very clean.", definition: "Bệnh viện rất sạch sẽ." }, { term: "We walked in the forest.", definition: "Chúng tôi đã đi dạo trong khu rừng." },
        { term: "The river is long.", definition: "Dòng sông thì dài." }, { term: "The garden has many flowers.", definition: "Khu vườn có rất nhiều hoa." }, { term: "It is an easy question.", definition: "Đó là một câu hỏi dễ." }, { term: "He is a handsome boy.", definition: "Cậu ấy là một chàng trai đẹp." },
        { term: "We walked slowly.", definition: "Chúng tôi đã đi bộ chầm chậm." }, { term: "I saw him yesterday.", definition: "Tôi đã thấy anh ấy vào ngày hôm qua." }, { term: "They will arrive tomorrow.", definition: "Họ sẽ đến vào ngày mai." }, { term: "The library is quiet.", definition: "Thư viện thì yên tĩnh." }
      ],
      en_level_5: [
        { term: "We must protect the environment.", definition: "Chúng ta phải bảo vệ môi trường." }, { term: "Air pollution is a big problem.", definition: "Ô nhiễm không khí là một vấn đề lớn." }, { term: "They explore the dark cave.", definition: "Họ khám phá hang động tối tăm." }, { term: "He discovered a new species.", definition: "Anh ấy đã phát hiện ra một loài mới." },
        { term: "The internet changed the world.", definition: "Mạng internet đã thay đổi thế giới." }, { term: "Scientists study the universe.", definition: "Các nhà khoa học nghiên cứu vũ trụ." }, { term: "Technology improves our lives.", definition: "Công nghệ cải thiện cuộc sống của chúng ta." }, { term: "Astronauts travel in space.", definition: "Các phi hành gia du hành trong không gian." },
        { term: "The rocket launched today.", definition: "Tên lửa đã được phóng hôm nay." }, { term: "Earth is a beautiful planet.", definition: "Trái Đất là một hành tinh xinh đẹp." }, { term: "I use software for work.", definition: "Tôi sử dụng phần mềm cho công việc." }, { term: "We need new hardware.", definition: "Chúng tôi cần phần cứng mới." },
        { term: "The galaxy is huge.", definition: "Thiên hà thì khổng lồ." }, { term: "He looked through a telescope.", definition: "Anh ấy đã nhìn qua một kính viễn vọng." }, { term: "Biology is the study of life.", definition: "Sinh học là ngành nghiên cứu về sự sống." }, { term: "Chemistry is a hard subject.", definition: "Hóa học là một môn học khó." },
        { term: "They invented a new machine.", definition: "Họ đã phát minh ra một cỗ máy mới." }, { term: "Space exploration is exciting.", definition: "Khám phá không gian rất thú vị." }, { term: "The satellite orbits the Earth.", definition: "Vệ tinh quay quanh Trái Đất." }, { term: "We reduce water pollution.", definition: "Chúng ta giảm thiểu ô nhiễm nước." }
      ],
      en_level_6: [
        { term: "Education is the key to success.", definition: "Giáo dục là chìa khóa dẫn đến thành công." }, { term: "He graduated from university.", definition: "Anh ấy đã tốt nghiệp đại học." }, { term: "They gained a lot of knowledge.", definition: "Họ đã thu nhận được rất nhiều kiến thức." }, { term: "Tourism boosts the local economy.", definition: "Du lịch thúc đẩy nền kinh tế địa phương." },
        { term: "Paris is a popular destination.", definition: "Paris là một điểm đến nổi tiếng." }, { term: "We should respect local culture.", definition: "Chúng ta nên tôn trọng văn hóa địa phương." }, { term: "They preserve ancient traditions.", definition: "Họ bảo tồn các truyền thống cổ xưa." }, { term: "Modern lifestyle is very fast.", definition: "Lối sống hiện đại diễn ra rất nhanh." },
        { term: "Eating healthy is important.", definition: "Ăn uống lành mạnh là điều quan trọng." }, { term: "The disease spread quickly.", definition: "Căn bệnh lây lan một cách nhanh chóng." }, { term: "The doctor treated the patient.", definition: "Bác sĩ đã điều trị cho bệnh nhân." }, { term: "She bought medicine at the pharmacy.", definition: "Cô ấy đã mua thuốc tại hiệu thuốc." },
        { term: "The surgery was successful.", definition: "Ca phẫu thuật đã thành công." }, { term: "His recovery took two weeks.", definition: "Sự hồi phục của anh ấy mất hai tuần." }, { term: "These are common symptoms.", definition: "Đây là những triệu chứng phổ biến." }, { term: "He studies at a top university.", definition: "Anh ấy học tại một trường đại học hàng đầu." },
        { term: "Cultural exchange is beneficial.", definition: "Giao lưu văn hóa mang lại lợi ích." }, { term: "They enjoy the modern lifestyle.", definition: "Họ tận hưởng lối sống hiện đại." }, { term: "The treatment was effective.", definition: "Việc điều trị đã có hiệu quả." }, { term: "She needs a good education.", definition: "Cô ấy cần một nền giáo dục tốt." }
      ],
      en_level_7: [
        { term: "Urbanization brings many challenges.", definition: "Đô thị hóa mang lại nhiều thách thức." }, { term: "The city needs better infrastructure.", definition: "Thành phố cần cơ sở hạ tầng tốt hơn." }, { term: "Sustainable agriculture is essential.", definition: "Nông nghiệp bền vững là điều thiết yếu." }, { term: "The economy is growing steadily.", definition: "Nền kinh tế đang tăng trưởng ổn định." },
        { term: "Foreign investment is increasing.", definition: "Đầu tư nước ngoài đang gia tăng." }, { term: "Inflation reduces purchasing power.", definition: "Lạm phát làm giảm sức mua." }, { term: "The government announced a new policy.", definition: "Chính phủ đã công bố một chính sách mới." }, { term: "They debated during the election.", definition: "Họ đã tranh luận trong suốt cuộc bầu cử." },
        { term: "Democracy empowers the citizens.", definition: "Dân chủ trao quyền cho công dân." }, { term: "The candidate gave a great speech.", definition: "Ứng cử viên đã có một bài phát biểu tuyệt vời." }, { term: "They reached a peace agreement.", definition: "Họ đã đạt được một thỏa thuận hòa bình." }, { term: "The contract was signed yesterday.", definition: "Hợp đồng đã được ký kết vào ngày hôm qua." },
        { term: "The treaty ended the long war.", definition: "Hiệp ước đã kết thúc cuộc chiến tranh dài." }, { term: "The alliance is very strong.", definition: "Liên minh rất vững mạnh." }, { term: "Poverty remains a global issue.", definition: "Nghèo đói vẫn là một vấn đề toàn cầu." }, { term: "Unemployment rates are rising.", definition: "Tỷ lệ thất nghiệp đang tăng lên." },
        { term: "Negotiation is a crucial skill.", definition: "Đàm phán là một kỹ năng thiết yếu." }, { term: "They discussed the new treaty.", definition: "Họ đã thảo luận về hiệp ước mới." }, { term: "The infrastructure was upgraded.", definition: "Cơ sở hạ tầng đã được nâng cấp." }, { term: "Economic growth requires investment.", definition: "Tăng trưởng kinh tế đòi hỏi sự đầu tư." }
      ],
      en_level_8: [
        { term: "Macroeconomics studies the whole economy.", definition: "Kinh tế vĩ mô nghiên cứu toàn bộ nền kinh tế." }, { term: "Psychology explains human behavior.", definition: "Tâm lý học giải thích hành vi con người." }, { term: "Cognitive development is a complex process.", definition: "Phát triển nhận thức là một quá trình phức tạp." }, { term: "Globalization connects the entire world.", definition: "Toàn cầu hóa kết nối toàn bộ thế giới." },
        { term: "Cultural integration is happening fast.", definition: "Hội nhập văn hóa đang diễn ra nhanh chóng." }, { term: "Her knowledge is quite profound.", definition: "Kiến thức của cô ấy khá là uyên thâm." }, { term: "The concept is highly abstract.", definition: "Khái niệm này mang tính trừu tượng cao." }, { term: "They proposed a new theoretical hypothesis.", definition: "Họ đã đề xuất một giả thuyết lý thuyết mới." },
        { term: "This phenomenon is rarely observed.", definition: "Hiện tượng này hiếm khi được quan sát thấy." }, { term: "The research methodology is rigorous.", definition: "Phương pháp luận nghiên cứu rất chặt chẽ." }, { term: "We need an analytical approach.", definition: "Chúng ta cần một cách tiếp cận phân tích." }, { term: "Empirical evidence supports the claim.", definition: "Bằng chứng thực nghiệm ủng hộ luận điểm này." },
        { term: "They used quantitative analysis.", definition: "Họ đã sử dụng phân tích định lượng." }, { term: "Qualitative research provides deep insights.", definition: "Nghiên cứu định tính cung cấp hiểu biết sâu sắc." }, { term: "The results are highly robust.", definition: "Các kết quả là cực kỳ vững chắc." }, { term: "The argument is perfectly valid.", definition: "Lập luận là hoàn toàn hợp lệ." },
        { term: "The cognitive load was too high.", definition: "Khối lượng nhận thức là quá tải." }, { term: "They studied the behavioral patterns.", definition: "Họ đã nghiên cứu các khuôn mẫu hành vi." }, { term: "The economic integration was successful.", definition: "Quá trình hội nhập kinh tế đã thành công." }, { term: "His hypothesis was finally proven.", definition: "Giả thuyết của anh ấy cuối cùng đã được chứng minh." }
      ],
      en_level_9: [
        { term: "This marks a major paradigm shift.", definition: "Điều này đánh dấu một sự thay đổi hệ chuẩn lớn." }, { term: "The dichotomy between good and evil.", definition: "Sự phân đôi giữa cái thiện và cái ác." }, { term: "The juxtaposition of the two images.", definition: "Sự đặt cạnh nhau của hai hình ảnh." }, { term: "The esoteric knowledge is hard to grasp.", definition: "Kiến thức bí truyền rất khó để nắm bắt." },
        { term: "Fame is often an ephemeral thing.", definition: "Sự nổi tiếng thường là một thứ phù du." }, { term: "We need a more pragmatic approach.", definition: "Chúng ta cần một cách tiếp cận thực dụng hơn." }, { term: "Smartphones have become ubiquitous.", definition: "Điện thoại thông minh đã trở nên nhan nhản ở khắp nơi." }, { term: "He is the quintessential gentleman.", definition: "Anh ấy là một quý ông chuẩn mực tinh túy." },
        { term: "There are a myriad of possibilities.", definition: "Có vô số những khả năng có thể xảy ra." }, { term: "The event acted as a catalyst for change.", definition: "Sự kiện đóng vai trò như một chất xúc tác cho sự thay đổi." }, { term: "The synergy between the two teams.", definition: "Sự hợp lực giữa hai đội ngũ." }, { term: "They formed a cohesive argument.", definition: "Họ đã hình thành một lập luận gắn kết." },
        { term: "Her speech was incredibly eloquent.", definition: "Bài phát biểu của cô ấy cực kỳ hùng hồn." }, { term: "He is an articulate and thoughtful speaker.", definition: "Anh ấy là một diễn giả ăn nói rõ ràng và sâu sắc." }, { term: "The rhetoric was persuasive but empty.", definition: "Thuật hùng biện mang tính thuyết phục nhưng sáo rỗng." }, { term: "You must understand the cultural nuances.", definition: "Bạn phải hiểu những sắc thái văn hóa." },
        { term: "There is a subtle difference here.", definition: "Có một sự khác biệt tinh tế ở đây." }, { term: "The profound impact of the discovery.", definition: "Tác động sâu sắc của sự khám phá này." }, { term: "Freedom is an intrinsic human right.", definition: "Tự do là một quyền cơ bản thiết yếu của con người." }, { term: "His benevolent actions saved many lives.", definition: "Hành động nhân từ của anh ấy đã cứu sống nhiều mạng người." }
      ]
    }
  },

  // --- PHÂN HỆ TIẾNG TRUNG (CHINESE HSK 1-9) ---
  zh: {
    vocab: {
      zh_level_1: [
        { term: "我", definition: "tôi" }, { term: "你", definition: "bạn" }, { term: "他", definition: "anh ấy" }, { term: "她", definition: "cô ấy" },
        { term: "我们", definition: "chúng tôi" }, { term: "你们", definition: "các bạn" }, { term: "他们", definition: "họ" }, { term: "人", definition: "người" },
        { term: "名字", definition: "tên" }, { term: "妈妈", definition: "mẹ" }, { term: "爸爸", definition: "bố" }, { term: "儿子", definition: "con trai" },
        { term: "女儿", definition: "con gái" }, { term: "老师", definition: "giáo viên" }, { term: "学生", definition: "học sinh" }, { term: "朋友", definition: "bạn bè" },
        { term: "医生", definition: "bác sĩ" }, { term: "先生", definition: "tiên sinh, ngài" }, { term: "小姐", definition: "tiểu thư, cô" }, { term: "太太", definition: "phu nhân, bà" }
      ],
      zh_level_2: [
        { term: "早上", definition: "buổi sáng" }, { term: "晚上", definition: "buổi tối" }, { term: "时间", definition: "thời gian" }, { term: "事情", definition: "sự việc" },
        { term: "考试", definition: "bài thi" }, { term: "问题", definition: "vấn đề" }, { term: "意思", definition: "ý nghĩa" }, { term: "颜色", definition: "màu sắc" },
        { term: "红色", definition: "màu đỏ" }, { term: "白色", definition: "màu trắng" }, { term: "黑色", definition: "màu đen" }, { term: "身体", definition: "cơ thể" },
        { term: "眼睛", definition: "đôi mắt" }, { term: "苹果", definition: "quả táo" }, { term: "西瓜", definition: "dưa hấu" }, { term: "咖啡", definition: "cà phê" },
        { term: "牛奶", definition: "sữa bò" }, { term: "自行车", definition: "xe đạp" }, { term: "汽车", definition: "xe ô tô" }, { term: "房间", definition: "căn phòng" }
      ],
      zh_level_3: [
        { term: "爱好", definition: "sở thích" }, { term: "音乐", definition: "âm nhạc" }, { term: "体育", definition: "thể thao" }, { term: "电影", definition: "phim ảnh" },
        { term: "节目", definition: "chương trình" }, { term: "成绩", definition: "thành tích" }, { term: "机会", definition: "cơ hội" }, { term: "城市", definition: "thành phố" },
        { term: "国家", definition: "quốc gia" }, { term: "环境", definition: "môi trường" }, { term: "春天", definition: "mùa xuân" }, { term: "夏天", definition: "mùa hè" },
        { term: "秋天", definition: "mùa thu" }, { term: "冬天", definition: "mùa đông" }, { term: "太阳", definition: "mặt trời" }, { term: "月亮", definition: "mặt trăng" },
        { term: "树", definition: "cái cây" }, { term: "鸟", definition: "con chim" }, { term: "魚", definition: "con cá" }, { term: "故事", definition: "câu chuyện" }
      ],
      zh_level_4: [
        { term: "经验", definition: "kinh nghiệm" }, { term: "计划", definition: "kế hoạch" }, { term: "目的", definition: "mục đích" }, { term: "结果", definition: "kết quả" },
        { term: "责任", definition: "trách nhiệm" }, { term: "态度", definition: "thái độ" }, { term: "感情", definition: "tình cảm" }, { term: "脾气", definition: "tính khí" },
        { term: "性格", definition: "tính cách" }, { term: "骄傲", definition: "tự hào, kiêu ngạo" }, { term: "伤心", definition: "đau lòng" }, { term: "兴奋", definition: "hưng phấn" },
        { term: "激动", definition: "kích động" }, { term: "普遍", definition: "phổ biến" }, { term: "复杂", definition: "phức tạp" }, { term: "详细", definition: "chi tiết" },
        { term: "准确", definition: "chính精确" }, { term: "严格", definition: "nghiêm khắc" }, { term: "浪漫", definition: "lãng mạn" }, { term: "幽默", definition: "hài hước" }
      ],
      zh_level_5: [
        { term: "挑战", definition: "thách thức" }, { term: "优势", definition: "ưu thế" }, { term: "劣势", definition: "yếu thế" }, { term: "趋势", definition: "xu hướng" },
        { term: "措施", definition: "biện pháp" }, { term: "政策", definition: "chính sách" }, { term: "制度", definition: "chế độ" }, { term: "权利", definition: "quyền lợi" },
        { term: "义务", definition: "nghĩa vụ" }, { term: "原则", definition: "nguyên tắc" }, { term: "道德", definition: "đạo đức" }, { term: "价值", definition: "giá trị" },
        { term: "意义", definition: "ý nghĩa (sâu sắc)" }, { term: "标志", definition: "dấu hiệu, biểu tượng" }, { term: "象征", definition: "tượng trưng" }, { term: "智慧", definition: "trí tuệ" },
        { term: "魅力", definition: "sức hấp dẫn" }, { term: "灵魂", definition: "linh hồn" }, { term: "命运", definition: "vận mệnh" }, { term: "奇迹", definition: "kỳ tích" }
      ],
      zh_level_6: [
        { term: "垄断", definition: "độc quyền" }, { term: "妥协", definition: "thỏa hiệp" }, { term: "歧视", definition: "kỳ thị" }, { term: "偏见", definition: "thành kiến" },
        { term: "争议", definition: "tranh nghị, tranh cãi" }, { term: "矛盾", definition: "mâu thuẫn" }, { term: "冲突", definition: "xung đột" }, { term: "纠纷", definition: "tranh chấp" },
        { term: "危机", definition: "khủng hoảng" }, { term: "灾难", definition: "tai nạn, thảm họa" }, { term: "牺牲", definition: "hy sinh" }, { term: "奉献", definition: "cống hiến" },
        { term: "剥夺", definition: "tước đoạt" }, { term: "侵犯", definition: "xâm phạm" }, { term: "捍卫", definition: "bảo vệ, bảo vệ" }, { term: "辩护", definition: "biện hộ" },
        { term: "申诉", definition: "khiếu nại" }, { term: "谴责", definition: "lên án" }, { term: "控告", definition: "buộc tội, khởi kiện" }, { term: "判决", definition: "phán quyết" }
      ],
      zh_level_7: [
        { term: "范式", definition: "mô thức, khuôn mẫu" }, { term: "隐喻", definition: "ẩn dụ" }, { term: "悖论", definition: "nghịch lý" }, { term: "演绎", definition: "diễn dịch" },
        { term: "归纳", definition: "quy nạp" }, { term: "诠释", definition: "giải thích, làm rõ" }, { term: "架构", definition: "cấu trúc, kiến trúc" }, { term: "机制", definition: "cơ chế" },
        { term: "载体", definition: "vật mang, thể chứa" }, { term: "渊源", definition: "nguồn gốc sâu xa" }, { term: "契机", definition: "cơ hội, thời cơ" }, { term: "雏形", definition: "hình dáng ban đầu" },
        { term: "蓝图", definition: "bản thiết kế, kế hoạch" }, { term: "愿景", definition: "tầm nhìn" }, { term: "瓶颈", definition: "nút thắt cổ chai" }, { term: "弊端", definition: "tệ nạn, mặt trái" },
        { term: "枢纽", definition: "đầu mối, trung tâm" }, { term: "引擎", definition: "động cơ" }, { term: "辐射", definition: "bức xạ, lan tỏa" }, { term: "渗透", definition: "thẩm thấu, xâm nhập" }
      ],
      zh_level_8: [
        { term: "斡旋", definition: "hòa giải, dàn xếp" }, { term: "邂逅", definition: "tình cờ gặp gỡ" }, { term: "羁绊", definition: "ràng buộc, vướng bận" }, { term: "窠臼", definition: "lối cũ, rập khuôn" },
        { term: "桎梏", definition: "gông cùm, trói buộc" }, { term: "圭臬", definition: "chuẩn mực, khuôn vàng thước ngọc" }, { term: "滥觞", definition: "nguồn gốc, sự bắt đầu" }, { term: "渊薮", definition: "nơi tập trung đông đúc" },
        { term: "藩篱", definition: "hàng rào, rào cản" }, { term: "鸿沟", definition: "khoảng cách lớn, vực thẳm" }, { term: "芥蒂", definition: "sự vướng bận trong lòng" }, { term: "龃龉", definition: "bất hòa, xích mích" },
        { term: "罅隙", definition: "khe hở, rạn nứt" }, { term: "症结", definition: "nút thắt, điểm mấu chốt" }, { term: "积淀", definition: "tích lũy, lắng đọng" }, { term: "沉淀", definition: "kết tủa, lắng đọng" },
        { term: "荟萃", definition: "hội tụ (nhân tài/vật tinh hoa)" }, { term: "砥砺", definition: "rèn giũa, tu dưỡng" }, { term: "淬炼", definition: "tôi luyện" }, { term: "升华", definition: "thăng hoa" }
      ],
      zh_level_9: [
        { term: "浩瀚", definition: "bao la, bát ngát" }, { term: "磅礴", definition: "hùng vĩ, hoành tráng" }, { term: "恢弘", definition: "rộng lớn, hào hùng" }, { term: "璀璨", definition: "rực rỡ, lấp lánh" },
        { term: "斑斓", definition: "sặc sỡ, rực rỡ" }, { term: "瑰丽", definition: "tráng lệ, lộng lẫy" }, { term: "旖旎", definition: "tươi đẹp, thướt tha" }, { term: "隽永", definition: "sâu xa, đầy ý nghĩa" },
        { term: "空灵", definition: "trống trải, thanh tao" }, { term: "澄澈", definition: "trong vắt, sáng trong" }, { term: "缥缈", definition: "hư ảo, mờ mịt" }, { term: "婉约", definition: "uyển chuyển, nhẹ nhàng" },
        { term: "粗犷", definition: "thô mộc, hào sảng" }, { term: "豪放", definition: "phóng khoáng, hào sảng" }, { term: "雄浑", definition: "hùng hồn, mạnh mẽ" }, { term: "悲壮", definition: "bi tráng" },
        { term: "苍凉", definition: "thê lương, hoang vắng" }, { term: "凄美", definition: "bi thương và đẹp đẽ" }, { term: "哀婉", definition: "bi ai, thê lương" }, { term: "缠绵", definition: "triền miên, day dứt" }
      ]
    }
  },

  // --- HÀM TRÍCH XUẤT DỮ LIỆU ĐƯỢC CHẾ BIẾN CHUẨN GAME (GAME-READY FALLBACK) ---
  getGameReadyFallback: function(gameType, lang, level, config = {}) {
    const safeLang = (lang === 'en' || lang === 'zh') ? lang : 'en';
    const mode = config.dataMode === 'sentence' ? 'sentence' : 'vocab';
    const safeLevel = level || (safeLang === 'zh' ? 'zh_level_1' : 'en_level_1');

    if (gameType === 'match') {
      const difficulty = config.difficulty || 'easy';
      const targetCount = difficulty === 'hard' ? 4 : 5;
      let fbItems = this.getFallbackData(safeLang, mode, safeLevel, 10);
      
      if (!fbItems || fbItems.length < targetCount) {
        fbItems = [
          { term: "Apple", definition: "Quả táo" },
          { term: "Banana", definition: "Quả chuối" },
          { term: "Cat", definition: "Con mèo" },
          { term: "Dog", definition: "Con chó" },
          { term: "Bird", definition: "Con chim" }
        ];
      }
      const realCards = fbItems.slice(0, targetCount);
      let trapCards = [];
      
      if (difficulty === 'hard') {
        const trapSources = fbItems.slice(targetCount, targetCount + 2);
        while (trapSources.length < 2) {
          trapSources.push({ term: "Trap FB " + trapSources.length, definition: "Bẫy DP " + trapSources.length });
        }
        
        for (let i = 0; i < trapSources.length; i++) {
          const trapCard = trapSources[i];
          let distortedTerm = null;
          let explanation = "";
          
          const type = Utils.detectSentence(trapCard.term) ? 'sentence' : 'word';
          
          if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
            const offRes = GameAlgoEngine.DistortionEngine.offline_distort(trapCard.term, safeLang, type);
            distortedTerm = type === 'word' ? offRes.wrongWord : offRes.wrongSentence;
            explanation = offRes.explanation;
          } else {
            distortedTerm = trapCard.term + "x";
            explanation = "Lỗi hình thái từ (Offline).";
          }
          
          trapCards.push({
            term: distortedTerm,
            distortedTerm: distortedTerm,
            definition: trapCard.definition,
            explanation: explanation,
            originalTerm: trapCard.term,
            isAiGenerated: false
          });
        }
      }
      
      const leftItems = [...realCards, ...trapCards].map((c, i) => ({
        id: `left_${i}_${Date.now()}`,
        term: c.term,
        definition: c.definition || "No definition",
        isTrap: trapCards.some(t => t.term === c.term),
        origin: c
      }));
      
      const rightItems = [];
      realCards.forEach((c, i) => { rightItems.push({ id: `right_real_${i}_${Date.now()}`, term: c.term, isTrap: false }); });
      
      for (let i = 0; i < trapCards.length; i++) {
        const trapCard = trapCards[i];
        rightItems.push({ id: `right_trap_${i}_${Date.now()}`, term: trapCard.distortedTerm || trapCard.term, isTrap: true, originalTerm: trapCard.originalTerm, explanation: trapCard.explanation });
      }
      
      const shuffleNoAdjacentTraps = (arr) => {
        if (!Utils.shuffleArray) return arr;
        let res = [...arr]; let valid = false; let tries = 0;
        while (!valid && tries < 50) {
          res = Utils.shuffleArray(res);
          valid = true;
          for (let j = 0; j < res.length - 1; j++) { if (res[j].isTrap && res[j+1].isTrap) { valid = false; break; } }
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
    
    if (gameType === 'scramble') {
      const difficulty = config.difficulty || 'easy';
      const inputMethod = config.inputMethod || 'tap';
      let fbItems = this.getFallbackData(safeLang, mode, safeLevel, 5);
      
      let fallbackItem = { term: "Learning languages is fun", definition: "Học ngôn ngữ rất vui", _isRescued: true };
      if (fbItems && fbItems.length > 0) {
        fallbackItem = { ...fbItems[Math.floor(Math.random() * fbItems.length)], _isRescued: true };
      }
      
      let parts = [];
      if (inputMethod === 'tap') {
        const isChinese = safeLang === 'zh';
        const isSentence = Utils.detectSentence(fallbackItem.term) || fallbackItem.term.includes(' ');
        const type = isSentence ? 'sentence' : 'word';
        const cleanAndLower = (textArr) => textArr.map(p => { let cleaned = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""); if (!isChinese) cleaned = cleaned.toLowerCase(); return cleaned; }).filter(p => p.trim() !== "");
        
        if (isChinese) { parts = fallbackItem.term.split(''); } else { if (isSentence) parts = fallbackItem.term.split(' '); else parts = fallbackItem.term.split(''); }
        parts = cleanAndLower(parts);
        
        if (difficulty === 'hard') {
          let targetCount = 2;
          const len = parts.length;
          if (len >= 5 && len <= 10) targetCount = Math.floor(Math.random() * 2) + 4;
          else if (len > 10) targetCount = Math.floor(Math.random() * 3) + 5;
          
          if (GameAlgoEngine?.ScrambleNoiseEngine?.offline_getNoise) {
            const noiseWords = GameAlgoEngine.ScrambleNoiseEngine.offline_getNoise(fallbackItem.term, [], safeLang, type, targetCount);
            if (noiseWords && noiseWords.length > 0) {
              let finalNoiseWords = [];
              if (isChinese || type === 'word') {
                noiseWords.forEach(w => { const cleanW = String(w).replace(/\s/g, ''); finalNoiseWords.push(...cleanW.split('')); });
              } else { finalNoiseWords = noiseWords; }
              finalNoiseWords = cleanAndLower(finalNoiseWords);
              
              if (Utils.shuffleArray) {
                finalNoiseWords = Utils.shuffleArray(finalNoiseWords).slice(0, targetCount);
              } else {
                finalNoiseWords = finalNoiseWords.slice(0, targetCount);
              }
              parts.push(...finalNoiseWords);
            }
          }
        }
      }
      return { origin: fallbackItem, parts, isAiGenerated: false, _isRescued: true };
    }
    
    // Trắc nghiệm, Đoán Hình
    if (gameType === 'quiz' || gameType === 'imagequiz') {
      let fbItems = this.getFallbackData(safeLang, mode, safeLevel, 5);
      let baseCard = { term: "Apple", definition: "Quả táo", isAiGenerated: false };
      if (fbItems && fbItems.length > 0) {
        baseCard = fbItems[0];
      }
      
      const isReverse = config.isReverse || false;
      const numOptions = 4;
      const correctOptText = isReverse ? baseCard.term : baseCard.definition;
      const correctOpt = { text: correctOptText, isCorrect: true };
      let distractors = [];
      const type = Utils.detectSentence(correctOptText) ? 'sentence' : 'word';
      
      if (GameAlgoEngine?.OptionsEngine?.offline_generateOptions) {
        const distTexts = GameAlgoEngine.OptionsEngine.offline_generateOptions(correctOptText, [], safeLang, type, numOptions - 1, isReverse);
        distractors = distTexts.map(d => ({ text: d, isCorrect: false }));
      }
      
      if (distractors.length < numOptions - 1) {
        const needed = (numOptions - 1) - distractors.length;
        for (let i = 0; i < needed; i++) {
          distractors.push({ text: correctOptText + " " + (i+1), isCorrect: false });
        }
      }
      
      if (Utils.shuffleArray) {
        distractors = Utils.shuffleArray(distractors.slice(0, numOptions - 1));
      } else {
        distractors = distractors.slice(0, numOptions - 1);
      }
      
      const correctPos = Math.floor(Math.random() * (distractors.length + 1));
      const finalOptions = [...distractors];
      finalOptions.splice(correctPos, 0, correctOpt);
      let returnObj = { question: baseCard, options: finalOptions, isAiGenerated: false, _isRescued: true };
      
      if (gameType === 'imagequiz') {
        returnObj = { ...baseCard, options: finalOptions, origin: baseCard, isAiGenerated: false, _isRescued: true };
        returnObj.options = returnObj.options.map(opt => {
          let query = opt.text + " isolated clipart";
          return {
            ...opt,
            image: `https://tse4.mm.bing.net/th?q=${encodeURIComponent(query)}&w=300&h=300&c=7&rs=1&p=0`
          };
        });
      }
      return returnObj;
    }
    
    // Điền từ khuyết
    if (gameType === 'fillblank') {
      let fbItems = this.getFallbackData(safeLang, mode, safeLevel, 1);
      let baseCard = { term: "Learning languages is very fun.", definition: "Học ngôn ngữ rất thú vị." };
      if (fbItems && fbItems.length > 0) baseCard = fbItems[0];
      const type = Utils.detectSentence(baseCard.term) ? 'sentence' : 'word';
      let maskedResult = null;
      
      if (GameAlgoEngine?.ClozeEngine?.offline_mask) {
        const offRes = GameAlgoEngine.ClozeEngine.offline_mask(baseCard.term, safeLang, type);
        maskedResult = { ...offRes, origin: baseCard, hint: baseCard.definition || offRes.hint, type: type, isAiGenerated: false, _isRescued: true };
      } else {
        maskedResult = { targetWord: baseCard.term, displaySentence: '[__________]', hint: baseCard.definition, origin: baseCard, type: type, isAiGenerated: false, _isRescued: true };
      }
      return maskedResult;
    }
    
    // Tìm lỗi sai
    if (gameType === 'spotmistake') {
      let fbItems = this.getFallbackData(safeLang, 'sentence', safeLevel, 1);
      let baseCard = { term: "The childrens are playing in the park.", definition: "Bọn trẻ đang chơi trong công viên. (Dự phòng)" };
      if (fbItems && fbItems.length > 0) baseCard = fbItems[0];
      const type = Utils.detectSentence(baseCard.term) ? 'sentence' : 'word';
      let offlineResult = { wrongSentence: baseCard.term + "x", wrongWord: baseCard.term + "x", correction: baseCard.term, explanation: "Lỗi hình thái (Dự phòng)" };
      
      if (GameAlgoEngine?.DistortionEngine?.offline_distort) {
        offlineResult = GameAlgoEngine.DistortionEngine.offline_distort(baseCard.term, safeLang, type);
      }
      return { ...offlineResult, origin: baseCard, isAiGenerated: false, _isRescued: true };
    }
    
    // Từ khác loại
    if (gameType === 'oddoneout') {
      if (GameAlgoEngine?.OddOneOutEngine?.offline_generate) {
        const offlineResult = GameAlgoEngine.OddOneOutEngine.offline_generate([], safeLang);
        if (offlineResult) {
          return { ...offlineResult, isAiGenerated: false, _isRescued: true };
        }
      }
      return { words: ["apple", "banana", "orange", "cat"], oddWord: "cat", explanation: "Cat là động vật (Dự phòng tuyệt đối).", isAiGenerated: false, _isRescued: true };
    }
    
    // Ngữ âm
    if (gameType === 'pronunciation') {
      if (safeLang === 'zh') {
        return {
          term: "妈, 吧, 哥, 喝",
          definition: "Chữ 吧 (ba) là thanh nhẹ, các chữ còn lại đều là thanh 1.",
          options: Utils.shuffleArray ? Utils.shuffleArray([
            { text: "妈", isCorrect: false },
            { text: "哥", isCorrect: false },
            { text: "吧", isCorrect: true },
            { text: "喝", isCorrect: false }
          ]) : [
            { text: "妈", isCorrect: false },
            { text: "哥", isCorrect: false },
            { text: "吧", isCorrect: true },
            { text: "喝", isCorrect: false }
          ],
          isAiGenerated: false,
          _isRescued: true
        };
      } else {
        return {
          term: "cat, bat, tall, map",
          definition: "Từ tall có âm /ɔː/ khác với âm /æ/ ở các từ còn lại.",
          options: Utils.shuffleArray ? Utils.shuffleArray([
            { text: "cat", isCorrect: false },
            { text: "bat", isCorrect: false },
            { text: "tall", isCorrect: true },
            { text: "map", isCorrect: false }
          ]) : [
            { text: "cat", isCorrect: false },
            { text: "bat", isCorrect: false },
            { text: "tall", isCorrect: true },
            { text: "map", isCorrect: false }
          ],
          isAiGenerated: false,
          _isRescued: true
        };
      }
    }
    
    // Nghe hiểu
    if (gameType === 'listening') {
      if (safeLang === 'zh') {
        return {
          audioScript: "你好，我叫王明。我喜欢吃苹果。",
          term: "王明喜欢吃什么？",
          options: Utils.shuffleArray ? Utils.shuffleArray([
            { text: "苹果 (Píngguǒ)", isCorrect: true },
            { text: "香蕉 (Xiāngjiāo)", isCorrect: false },
            { text: "西瓜 (Xīguā)", isCorrect: false },
            { text: "米饭 (Mǐfàn)", isCorrect: false }
          ]) : [
            { text: "苹果 (Píngguǒ)", isCorrect: true },
            { text: "香蕉 (Xiāngjiāo)", isCorrect: false },
            { text: "西瓜 (Xīguā)", isCorrect: false },
            { text: "米饭 (Mǐfàn)", isCorrect: false }
          ],
          explanation: "Trong đoạn băng, người nói nói rằng: '我喜欢吃苹果' (Tôi thích ăn táo).",
          isAiGenerated: false,
          _isRescued: true
        };
      } else {
        return {
          audioScript: "Hello, my name is John. I like to eat apples and play football in the park.",
          term: "What does John like to eat?",
          options: Utils.shuffleArray ? Utils.shuffleArray([
            { text: "Apples", isCorrect: true },
            { text: "Bananas", isCorrect: false },
            { text: "Oranges", isCorrect: false },
            { text: "Grapes", isCorrect: false }
          ]) : [
            { text: "Apples", isCorrect: true },
            { text: "Bananas", isCorrect: false },
            { text: "Oranges", isCorrect: false },
            { text: "Grapes", isCorrect: false }
          ],
          explanation: "Trong đoạn băng, người nói nói rằng: 'I like to eat apples'.",
          isAiGenerated: false,
          _isRescued: true
        };
      }
    }
    
    // Fallback Default
    return { term: "Lỗi hệ thống", definition: "Dữ liệu cứu hộ không xác định", _isRescued: true };
  },

  // --- HÀM TRÍCH XUẤT DỮ LIỆU TỰ ĐỘNG (Nguyên bản) ---
  getFallbackData: function(lang, mode, level, count = 5) {
    try {
      let pool = this[lang]?.[mode]?.[level];
      if (!pool || pool.length === 0) {
        // Tính năng Cứu hộ chéo: Nếu thiếu level cụ thể, lấy ngẫu nhiên từ tất cả các level khác
        const allLevelsData = Object.values(this[lang]?.[mode] || {});
        pool = allLevelsData.flat();
      }
      
      if (!pool || pool.length === 0) return [];
      
      // Trả về dữ liệu ngẫu nhiên, giới hạn số lượng
      return Utils.shuffleArray([...pool]).slice(0, count);
    } catch(e) {
      console.warn("FallbackDataEngine extraction failed:", e);
      return [];
    }
  }
};