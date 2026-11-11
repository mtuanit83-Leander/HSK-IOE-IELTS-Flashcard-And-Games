/**
 * @file src/engines/microPrompts.js
 * @description Kho bẫy ngữ pháp vi phân (Micro-prompts) và Ma trận Trọng số (Weight Matrix).
 * @origin Tầng 2 - Block 2.9 (IoeDataEngine - MICRO_PROMPTS & Weight Filter)
 */

// ==================================================================================
// 1. KHO ĐẠN VI LỆNH (MICRO-PROMPTS REPOSITORY)
// ==================================================================================
export const MICRO_PROMPTS = {
  // ====================================================
  // GAME TRẮC NGHIỆM (QUIZ) - SINH ĐÁP ÁN NHIỄU
  // ====================================================
  quiz: {
    // Bẫy Tiếng Trung (HSK 1)
    zh_hsk1_pronoun_gender: { label: "Đại từ nhân xưng (Giới tính)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào đại từ nhân xưng. Hãy tạo đáp án nhiễu bằng cách dùng sai đại từ giới tính (như dùng 他 cho nữ hoặc 她 cho nam)." },
    zh_hsk1_pronoun_location: { label: "Đại từ chỉ thị (Vật/Nơi chốn)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào đại từ chỉ thị. Hãy tạo nhiễu bằng cách nhầm lẫn giữa đại từ chỉ vật (这/那) và đại từ chỉ nơi chốn (这儿/那儿)." },
    zh_hsk1_question_quantity: { label: "Từ để hỏi số lượng (几/多少)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào từ để hỏi số lượng. Hãy tạo nhiễu bằng cách dùng sai ngữ cảnh của 几 và 多少 (ví dụ dùng 几 mà không có lượng từ)." },
    zh_hsk1_number_liang: { label: "Số lượng từ (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào số đếm. Hãy tạo nhiễu bằng cách dùng số đếm 二 đứng trước lượng từ thay vì dùng lượng số 两." },
    zh_hsk1_measure_mismatch: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào lượng từ. Hãy tạo đáp án nhiễu bằng cách ghép sai lượng từ với danh từ (như 一个书 thay vì 一本书)." },
    zh_hsk1_negation_bumei: { label: "Phủ định (不/没)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào phó từ phủ định. Hãy tạo nhiễu bằng cách dùng 不 để phủ định quá khứ/sở hữu, hoặc dùng 没 cho tương lai." },
    zh_hsk1_modal_ability: { label: "Động từ năng nguyện (会/能)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào động từ năng nguyện. Hãy tạo nhiễu bằng cách tráo đổi cách dùng của 会 (kỹ năng) và 能 (khả năng vật lý)." },
    zh_hsk1_verb_direction: { label: "Hướng di chuyển (去/来)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào hướng di chuyển. Hãy tạo nhiễu bằng cách dùng ngược động từ 去 và 来 so với bối cảnh của người nói." },
    zh_hsk1_adj_predicate_shi: { label: "Vị ngữ tính từ (Thừa 是)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào câu vị ngữ tính từ. Hãy tạo nhiễu bằng cách chèn thừa động từ 是 vào trước tính từ y hệt ngữ pháp tiếng Việt." },
    zh_hsk1_particle_de_redundant: { label: "Trợ từ 的", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trợ từ 的. Hãy tạo nhiễu bằng cách lạm dụng 的 tạo ra sở hữu kép, hoặc lược bỏ 的 khi bắt buộc phải có." },
    zh_hsk1_exclam_tai_le: { label: "Cấu trúc cảm thán 太...了", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào cấu trúc 太...了. Hãy tạo nhiễu bằng cách gắn thêm đuôi 了 vào dạng phủ định 不太." },
    zh_hsk1_question_ma_ne: { label: "Trợ từ nghi vấn (吗/呢)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trợ từ nghi vấn. Hãy tạo nhiễu bằng cách gắn 吗 vào câu đã có từ để hỏi, hoặc xếp sai vị trí chữ 呢." },
    zh_hsk1_serial_verb_order: { label: "Câu liên động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào câu liên động. Hãy tạo nhiễu bằng cách đẩy cụm địa điểm ra phía sau động từ chính theo thói quen dịch word-by-word." },
    zh_hsk1_time_order: { label: "Trạng ngữ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trạng ngữ thời gian. Hãy tạo nhiễu bằng cách dời từ chỉ thời gian xuống cuối câu." },
    zh_hsk1_place_order: { label: "Trạng ngữ địa điểm (在)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trạng ngữ địa điểm (在). Hãy tạo nhiễu bằng cách đặt cụm giới từ 在 + Địa điểm ra sau động từ." },
    
    // Bẫy Tiếng Trung (HSK 2)
    zh_hsk2_pronoun_ta_mismatch: { label: "Đại từ chỉ người/vật", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào đại từ. Hãy tạo đáp án nhiễu bằng cách dùng sai đại từ chỉ người/vật (như dùng 它 cho người hoặc 他 cho con vật)." },
    zh_hsk2_pronoun_mei_measure: { label: "Đại từ 每", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào đại từ 每. Hãy tạo đáp án nhiễu bằng cách lược bỏ lượng từ đứng giữa chữ 每 và danh từ." },
    zh_hsk2_number_er_liang: { label: "Số lượng (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào số lượng. Hãy tạo đáp án nhiễu bằng cách dùng số đếm 二 đứng trước lượng từ thay vì dùng 两." },
    zh_hsk2_measure_mismatch: { label: "Lượng từ chuyên biệt", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào lượng từ. Hãy tạo đáp án nhiễu bằng cách ghép sai lượng từ chuyên biệt (như dùng 张 cho quần áo hoặc 件 cho giấy)." },
    zh_hsk2_adv_you_zai: { label: "Phó từ lặp lại (又/再)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào phó từ lặp lại. Hãy tạo đáp án nhiễu bằng cách hoán đổi cách dùng của 又 (quá khứ) và 再 (tương lai)." },
    zh_hsk2_adv_jiu_pos: { label: "Phó từ 就", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào phó từ 就. Hãy tạo đáp án nhiễu bằng cách đặt chữ 就 lên trước danh từ chỉ thời gian." },
    zh_hsk2_prep_gei_order: { label: "Giới từ 给", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào giới từ 给. Hãy tạo đáp án nhiễu bằng cách đặt cụm '给 + Tân ngữ' ra phía sau động từ chính." },
    zh_hsk2_conj_missing_pair: { label: "Câu ghép (Thiếu vế)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào câu ghép. Hãy tạo đáp án nhiễu bằng cách cố tình bỏ quên một vế của cặp liên từ hô ứng (như có 因为 nhưng thiếu 所以)." },
    zh_hsk2_conj_logic_clash: { label: "Logic liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào logic liên từ. Hãy tạo đáp án nhiễu bằng cách ghép sai hai nửa của các cặp liên từ (như ghép 因为 với 但是)." },
    zh_hsk2_state_comp_missing_verb: { label: "Bổ ngữ trạng thái (Thiếu động từ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào bổ ngữ trạng thái. Hãy tạo đáp án nhiễu bằng cách không lặp lại động từ khi câu có mang tân ngữ." },
    zh_hsk2_state_comp_obj_pos: { label: "Bổ ngữ trạng thái (Vị trí tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào bổ ngữ trạng thái. Hãy tạo đáp án nhiễu bằng cách dời tân ngữ ra phía sau trợ từ 得." },
    zh_hsk2_compare_bi_adv: { label: "Câu so sánh 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào câu so sánh 比. Hãy tạo đáp án nhiễu bằng cách chèn thừa phó từ mức độ tuyệt đối (như 很, 非常) vào trước tính từ." },
    zh_hsk2_prog_zhengzai_clash: { label: "Trạng thái tiếp diễn 正在", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trạng thái tiếp diễn. Hãy tạo đáp án nhiễu bằng cách thay 正在 bằng phó từ chỉ sự hoàn tất (như 已经) nhưng vẫn giữ đuôi 呢." },
    zh_hsk2_approx_duo_less10: { label: "Ước lượng số nhỏ (<10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào ước lượng số nhỏ (<10). Hãy tạo đáp án nhiễu bằng cách đặt chữ 多 lên trước lượng từ." },
    zh_hsk2_approx_duo_more10: { label: "Ước lượng số lớn (>=10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào ước lượng số lớn (>=10). Hãy tạo đáp án nhiễu bằng cách đặt chữ 多 ra phía sau lượng từ." },
    zh_hsk2_prep_cong_li: { label: "Giới từ khoảng cách (从/离)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào giới từ khoảng cách. Hãy tạo đáp án nhiễu bằng cách hoán đổi cách dùng của 从 (điểm bắt đầu) và 离 (khoảng cách tĩnh)." },
    zh_hsk2_aspect_zhe_le: { label: "Trợ từ động thái (着/了)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào trợ từ động thái. Hãy tạo đáp án nhiễu bằng cách dùng 了 (đã xong) thay cho 着 (đang duy trì trạng thái)." },
    
    // Bẫy Tiếng Trung (HSK Legacy - Dành cho HSK 3/4)
    zh_hsk_separable_obj: { label: "Động từ Ly hợp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Động từ Ly hợp (như 帮忙, 结婚). Bạn hãy tạo đáp án nhiễu tự nhiên bằng cách gắn thêm tân ngữ trực tiếp vào ngay sau động từ ly hợp để mô phỏng lỗi sai người học hay mắc phải." },
    zh_hsk_adv_zhongyu: { label: "Phó từ 终于", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là phó từ 终于. Bạn hãy khéo léo tạo đáp án nhiễu bằng cách đổi vị trí phó từ này ra sau động từ chính." },
    zh_hsk_adv_degree: { label: "Phó từ mức độ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Điểm nhấn là Phó từ chỉ mức độ. Bạn có thể sáng tạo đáp án nhiễu bằng cách thiết kế sai cấu trúc của phó từ 极 (như lược bỏ chữ 了) hoặc ghép sai cặp hô ứng 越...越..." },
    zh_hsk_prep_mismatch: { label: "Giới từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Giới từ. Hãy thử tạo nhiễu bằng cách dùng một giới từ có vẻ hợp lý nhưng lại sai ngữ cảnh (ví dụ nhầm lẫn giữa 根据 và 关于)." },
    zh_hsk_conj_mismatch: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tập trung vào Liên từ. Hãy sáng tạo đáp án nhiễu bằng cách làm gãy cặp liên từ tăng tiến 不但...而且... và ghép chúng với những từ không liên quan." },
    zh_hsk_noun_space: { label: "Danh từ không gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào Danh từ không gian. Bạn hãy tạo nhiễu bằng cách đưa danh từ không gian lên làm chủ ngữ một cách phi logic." },
    zh_hsk_rc_negation: { label: "Phủ định Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc là Bổ ngữ Kết quả trong quá khứ. Hãy tạo đáp án nhiễu bằng cách dùng 不 để phủ định thay vì dùng 没." },
    zh_hsk_rc_state: { label: "Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Bổ ngữ Kết quả. Bạn hãy sáng tạo nhiễu bằng cách thay đổi trạng thái kết quả của hành động sao cho sai lệch logic tự nhiên với ngữ cảnh." },
    zh_hsk_pc_ability: { label: "Bổ ngữ Khả năng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Bổ ngữ Khả năng. Bạn hãy tạo nhiễu bằng cách phối hợp sai cấu trúc 得/不 hoặc nhầm lẫn sang động từ năng nguyện 能/不能." },
    zh_hsk_dc_location: { label: "Bổ ngữ Xu hướng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Bổ ngữ Xu hướng. Hãy tạo nhiễu bằng cách đặt Tân ngữ Địa điểm ra phía sau chữ 来 hoặc 去." },
    zh_hsk_dc_direction: { label: "Bổ ngữ Xu hướng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Điểm nhấn là Bổ ngữ Xu hướng. Hãy sáng tạo đáp án nhiễu bằng cách đảo ngược hướng di chuyển so với góc nhìn thực tế của người nói." },
    zh_hsk_ba_indefinite: { label: "Câu chữ 把 (Tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Hãy tạo nhiễu bằng cách dùng một Tân ngữ không xác định (như 一本书 thay cho 那本书) để thay đổi tính chất câu." },
    zh_hsk_ba_result: { label: "Câu chữ 把 (Kết quả)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Bạn có thể tạo nhiễu bằng cách để trống thành phần kết quả hoặc cách xử lý ở cuối câu." },
    zh_hsk_bei_reverse: { label: "Câu chữ 被", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 被. Hãy tạo đáp án nhiễu thú vị bằng cách đảo ngược vị trí giữa chủ thể tác động và đối tượng tiếp nhận." },
    zh_hsk_exist_order: { label: "Câu tồn tại với 着", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu tồn tại với 着. Hãy tạo nhiễu bằng cách dời Trạng ngữ Nơi chốn ra phía sau Động từ." },
    zh_hsk_emph_order: { label: "Cấu trúc nhấn mạnh 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc nhấn mạnh 连...也/都. Bạn hãy tạo nhiễu bằng cách đặt sai vị trí của đối tượng được nhấn mạnh ra sau phó từ." },
    zh_hsk_emph_extreme: { label: "Cấu trúc 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 连...也/都. Hãy thử tạo nhiễu bằng cách thay thế đối tượng nhấn mạnh bằng một thứ gì đó quá đỗi bình thường, làm mất đi tính cực đoan vốn có." },
    zh_hsk_paired_only_if: { label: "Cặp 只有...才...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cặp 只有...才... Hãy tạo đáp án nhiễu bằng cách thay đổi từ hô ứng (như thay 才 bằng 就)." },
    zh_hsk_paired_as_long_as: { label: "Cặp 只要...就...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cặp 只要...就... Hãy tạo đáp án nhiễu bằng cách thay đổi từ hô ứng (như thay 就 bằng 才)." },
    zh_hsk_dist_li: { label: "Khoảng cách với 离", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Khoảng cách với 离. Bạn hãy tạo nhiễu bằng cách sử dụng giới từ 从 thay cho 离 một cách tự nhiên." },
    zh_hsk_comp_bi: { label: "Câu so sánh với 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu so sánh với 比. Bạn có thể tạo nhiễu bằng cách chèn thêm các phó từ chỉ mức độ (như 很, 非常) vào ngay trước tính từ." },
    zh_hsk_except_chule: { label: "Ngoại trừ 除了...以外", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Ngoại trừ 除了...以外. Hãy tạo nhiễu bằng cách ghép sai cặp hô ứng ở vế sau, ví dụ dùng 但是 thay cho 还/也." },
    general_trap: { label: "Bẫy từ vựng chung", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sáng tạo các đáp án nhiễu mang sắc thái ý nghĩa hoặc từ loại gần giống với câu gốc nhưng sai lệch một cách tinh tế." },
    
    // Bẫy Tiếng Anh (Pre-A1)
    pre_a1_article_an: { label: "Mạo từ (A/An)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào Mạo từ (A/An). Bạn hãy tạo đáp án nhiễu bằng cách dùng sai mạo từ trước nguyên âm hoặc phụ âm để mô phỏng lỗi thường gặp." },
    pre_a1_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Danh từ số nhiều. Hãy sáng tạo đáp án nhiễu bằng cách không thêm 's' vào danh từ số nhiều, hoặc tự ý thêm 's' vào danh từ số ít." },
    pre_a1_tobe_match: { label: "Động từ To be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Động từ To be. Bạn hãy tạo nhiễu bằng cách ghép sai cặp đại từ và to be (như I is, It am) hoặc dịch word-by-word thiếu to be." },
    pre_a1_this_that: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào Đại từ chỉ định. Hãy tạo đáp án nhiễu bằng cách dùng sai từ chỉ khoảng cách (This/That) so với ngữ cảnh vật lý của câu." },
    pre_a1_like_plural: { label: "Cấu trúc sở thích", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc sở thích (Like + Danh từ). Bạn hãy tạo nhiễu bằng cách bỏ đuôi số nhiều của danh từ đếm được đứng sau chữ like." },
    pre_a1_commands: { label: "Câu mệnh lệnh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu mệnh lệnh. Hãy sáng tạo đáp án nhiễu cho câu phủ định bằng cách dùng chữ 'No' thay vì 'Don\\'t' một cách tự nhiên." },
    pre_a1_adj_order: { label: "Trật tự Tính từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trật tự Tính từ. Bạn hãy tạo nhiễu bằng cách đặt tính từ ra sau danh từ, bắt chước cấu trúc ngữ pháp của tiếng Việt." },
    pre_a1_he_she: { label: "Giới tính Đại từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới tính Đại từ. Hãy thử tạo nhiễu bằng cách dùng 'He' cho nhân vật nữ và 'She' cho nhân vật nam." },
    pre_a1_have_has: { label: "Động từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ sở hữu. Bạn hãy tạo nhiễu bằng cách đảo lộn cách dùng 'have' và 'has' cho các ngôi nhân xưng sai quy tắc." },
    pre_a1_prepositions: { label: "Giới từ vị trí", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ vị trí (in, on, under). Hãy sáng tạo đáp án nhiễu bằng cách thay đổi giới từ khiến cho logic vật lý trở nên vô lý." },
    pre_a1_yesno_order: { label: "Câu hỏi Yes/No", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi Yes/No. Hãy tạo nhiễu bằng cách giữ nguyên trật tự câu khẳng định và chỉ thêm dấu chấm hỏi ở cuối." },
    pre_a1_can_cant: { label: "Khả năng (Can/Can't)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Khả năng (Can/Can\\'t). Bạn hãy tạo đáp án nhiễu bằng cách đảo lộn sự thật hiển nhiên hoặc thêm chữ 'to' vào sau 'can'." },
    
    // Bẫy Tiếng Anh (A1)
    eng_a1_pres_3rd_person: { label: "Động từ ngôi thứ 3 số ít", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ ngôi thứ 3 số ít. Bạn hãy tạo đáp án nhiễu bằng cách bỏ quên đuôi 's/es' hoặc thêm sai quy tắc." },
    eng_a1_pres_tobe_verb_clash: { label: "Lỗi thừa To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lỗi thừa To Be. Hãy sáng tạo đáp án nhiễu bằng cách chèn thêm động từ To Be vào trước động từ thường một cách tự nhiên." },
    eng_a1_pres_auxiliary: { label: "Trợ động từ phủ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trợ động từ phủ định. Bạn hãy tạo nhiễu bằng cách dùng sai 'don\\'t' thay cho 'doesn\\'t' hoặc ngược lại." },
    eng_a1_adv_frequency_pos: { label: "Vị trí trạng từ tần suất", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí trạng từ tần suất. Hãy tạo đáp án nhiễu bằng cách đặt trạng từ sai chỗ (vd: đặt trước To Be hoặc sau động từ thường)." },
    eng_a1_pres_cont_missing_be: { label: "Hiện tại tiếp diễn (Thiếu To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Bạn hãy tạo nhiễu bằng cách lược bỏ động từ To Be trong câu, chỉ để lại V-ing." },
    eng_a1_pres_cont_base_verb: { label: "Hiện tại tiếp diễn (Thiếu -ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Hãy sáng tạo đáp án nhiễu bằng cách giữ nguyên V1 thay vì thêm đuôi '-ing'." },
    eng_a1_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Bạn hãy tạo nhiễu bằng cách áp dụng thì Hiện tại tiếp diễn cho câu có dấu hiệu Hiện tại đơn, hoặc ngược lại." },
    eng_a1_past_tobe_agreement: { label: "Quá khứ To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ To Be. Hãy tạo đáp án nhiễu bằng cách chia sai số ít/số nhiều của 'was' và 'were'." },
    eng_a1_past_tobe_verb_clash: { label: "Quá khứ đơn (Thừa To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Bạn hãy tạo nhiễu bằng cách chèn thừa 'was/were' vào trước động từ V-ed." },
    eng_a1_past_missing_ed: { label: "Quá khứ đơn (Thiếu -ed)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Hãy sáng tạo đáp án nhiễu bằng cách bỏ quên việc chia động từ về quá khứ dù câu có dấu hiệu thời gian rõ ràng." },
    eng_a1_modal_can_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy tạo nhiễu bằng cách chèn thêm giới từ 'to' vào ngay sau chữ 'can'." },
    eng_a1_modal_can_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo đáp án nhiễu bằng cách tự ý thêm 's' vào động từ theo sau 'can' khi chủ ngữ là ngôi thứ 3 số ít." },
    eng_a1_would_like: { label: "Cấu trúc Would like", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Would like. Bạn hãy tạo nhiễu bằng cách dùng chữ 'like' thay vì 'would like' trong ngữ cảnh gọi món hoặc đưa ra yêu cầu." },
    eng_a1_possessive_adj: { label: "Tính từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ sở hữu. Hãy sáng tạo đáp án nhiễu bằng cách dùng đại từ nhân xưng (me, she, he) thay thế cho tính từ sở hữu." },
    eng_a1_demonstrative_clash: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Bạn hãy tạo nhiễu bằng cách dùng This/That cho danh từ số nhiều, hoặc These/Those cho danh từ số ít." },
    eng_a1_uncountable_plural: { label: "Danh từ không đếm được", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ không đếm được. Hãy tạo đáp án nhiễu bằng cách xem danh từ không đếm được như danh từ đếm được (thêm s/es)." },
    eng_a1_prep_time: { label: "Giới từ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ thời gian. Bạn hãy tạo nhiễu bằng cách hoán đổi sai cách dùng của các giới từ in, on, at." },
    eng_a1_prep_place_vn: { label: "Giới từ nơi chốn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ nơi chốn. Hãy sáng tạo đáp án nhiễu bằng cách dịch word-by-word từ tiếng Việt (vd: dùng 'on the tree' thay vì 'in the tree')." },
    eng_a1_conjunction_logic: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Bạn hãy tạo nhiễu bằng cách hoán đổi các liên từ chỉ nguyên nhân (because) và tương phản (but)." },
    eng_a1_wh_question_match: { label: "Từ để hỏi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Từ để hỏi. Hãy tạo đáp án nhiễu bằng cách dùng từ Wh- không khớp với logic của câu trả lời." },
    
    // Bẫy Tiếng Anh (A1+)
    eng_a1p_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Bạn hãy tạo đáp án nhiễu bằng cách dùng thì hiện tại đơn với dấu hiệu tiếp diễn, hoặc ngược lại." },
    eng_a1p_past_ed: { label: "Động từ quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ quá khứ bất quy tắc. Hãy tạo đáp án nhiễu bằng cách tự ý thêm đuôi '-ed' vào động từ bất quy tắc." },
    eng_a1p_past_double: { label: "Quá khứ phủ định/nghi vấn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ phủ định/nghi vấn. Bạn hãy tạo nhiễu bằng cách chia quá khứ cho cả trợ động từ (did/didn\\'t) và động từ chính." },
    eng_a1p_past_be_vs_do: { label: "To be và Trợ động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: To be và Trợ động từ. Hãy tạo đáp án nhiễu bằng cách dùng sai 'was/were' thay cho 'did', hoặc ngược lại." },
    eng_a1p_comp_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh hơn. Bạn hãy tạo nhiễu bằng cách áp dụng so sánh kép (thêm cả 'more' và đuôi '-er')." },
    eng_a1p_comp_irregular: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy tạo đáp án nhiễu bằng cách thêm đuôi '-er' vào tính từ bất quy tắc (như good, bad)." },
    eng_a1p_comp_than: { label: "Giới từ so sánh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ so sánh. Bạn hãy tạo nhiễu bằng cách bỏ quên chữ 'than' hoặc thay bằng 'that'/'then'." },
    eng_a1p_quant_some_any: { label: "Some/Any", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Some/Any. Hãy tạo đáp án nhiễu bằng cách dùng 'some' cho câu phủ định/nghi vấn hoặc 'any' cho câu khẳng định." },
    eng_a1p_quant_much_many: { label: "Lượng từ (Much/Many)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ. Bạn hãy tạo nhiễu bằng cách đảo lộn cách dùng 'much' và 'many' đối với danh từ đếm được/không đếm được." },
    eng_a1p_quant_a_lot_of: { label: "Lượng từ (A lot of)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ A lot of. Hãy sáng tạo đáp án nhiễu bằng cách bỏ quên chữ 'of' phía sau 'a lot' hoặc 'lots'." },
    eng_a1p_conj_because_so: { label: "Liên từ (Because/So)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Bạn hãy tạo nhiễu bằng cách dùng đồng thời cả 'because' và 'so' trong cùng một câu ghép." },
    eng_a1p_adv_very_verb: { label: "Trạng từ Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Very. Hãy tạo đáp án nhiễu bằng cách đặt chữ 'very' đứng ngay trước động từ thường (vd: very like)." },
    eng_a1p_adv_too_much: { label: "Trạng từ Too/Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Too/Very. Bạn hãy tạo nhiễu bằng cách dùng chữ 'too' thay cho 'very' khi mang ý nghĩa khen ngợi, tích cực." },
    eng_a1p_job_article: { label: "Mạo từ nghề nghiệp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ nghề nghiệp. Hãy tạo đáp án nhiễu bằng cách lược bỏ mạo từ 'a/an' đứng trước danh từ chỉ nghề nghiệp." },
    eng_a1p_modal_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy tạo nhiễu bằng cách nhét thêm chữ 'to' vào sau động từ khuyết thiếu." },
    eng_a1p_modal_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo đáp án nhiễu bằng cách tự ý thêm 's' vào động từ khuyết thiếu hoặc động từ chính khi chủ ngữ là ngôi thứ ba số ít." },
    eng_a1p_emotion_ed_ing: { label: "Tính từ chỉ cảm xúc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ chỉ cảm xúc. Bạn hãy tạo nhiễu bằng cách nhầm lẫn giữa tính từ đuôi '-ed' (cảm xúc) và '-ing' (bản chất)." },
    eng_a1p_tag_question: { label: "Câu hỏi đuôi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi đuôi. Hãy tạo đáp án nhiễu bằng cách dùng sai thể khẳng định/phủ định (ngược cực) ở phần đuôi." },
    eng_a1p_phrasal_prep: { label: "Cụm động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ. Bạn hãy tạo nhiễu bằng cách bỏ quên giới từ đi kèm với động từ (vd: turn the TV thay vì turn on)." },
    eng_a1p_time_quarter: { label: "Thời gian (Past/To)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thời gian. Hãy tạo đáp án nhiễu bằng cách đảo lộn vị trí của 'past' và 'to' khi nói giờ kém/giờ hơn." },
    
    // Bẫy Tiếng Anh (A2)
    eng_a2_past_interrupt: { label: "Hành động cắt ngang", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hành động cắt ngang. Bạn hãy tạo đáp án nhiễu bằng cách đảo ngược thì giữa hành động đang xảy ra (quá khứ tiếp diễn) và hành động cắt ngang (quá khứ đơn)." },
    eng_a2_pres_perf_form: { label: "Hiện tại hoàn thành", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại hoàn thành. Hãy tạo đáp án nhiễu bằng cách lược bỏ trợ động từ have/has hoặc dùng dạng quá khứ V2 thay vì V3/ed." },
    eng_a2_pres_perf_ever: { label: "Vị trí Ever/Never", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí Ever/Never. Bạn hãy sinh ra đáp án nhiễu bằng cách đặt sai vị trí của từ ever hoặc never trong cấu trúc hiện tại hoàn thành." },
    eng_a2_future_will_going: { label: "Thì tương lai", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thì tương lai. Hãy tạo đáp án nhiễu bằng cách bỏ quên to-be trong cấu trúc 'be going to' hoặc dùng 'will' cho một kế hoạch đã định sẵn." },
    eng_a2_although_but: { label: "Mặc dù... nhưng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mặc dù... nhưng. Bạn hãy tạo đáp án nhiễu tự nhiên bằng cách chèn thừa chữ 'but' vào mệnh đề thứ hai sau 'Although'." },
    eng_a2_because_so: { label: "Bởi vì... cho nên", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bởi vì... cho nên. Hãy sinh ra đáp án nhiễu bằng cách chèn thừa chữ 'so' vào mệnh đề thứ hai sau 'Because'." },
    eng_a2_if_type1_will: { label: "Câu điều kiện loại 1", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu điều kiện loại 1. Bạn hãy tạo đáp án nhiễu bằng cách nhét thừa trợ động từ 'will' vào ngay mệnh đề chứa 'If'." },
    eng_a2_when_while_swap: { label: "When/While", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: When/While. Hãy tạo đáp án nhiễu bằng cách dùng 'While' trước hành động cắt ngang, hoặc 'When' trước hành động đang diễn ra." },
    eng_a2_adv_of_manner: { label: "Trạng từ thể cách", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ thể cách. Bạn hãy sinh ra đáp án nhiễu bằng cách dùng một Tính từ thay cho Trạng từ để bổ nghĩa cho động từ thường." },
    eng_a2_comparative_double: { label: "So sánh kép", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh kép. Hãy tạo đáp án nhiễu bằng cách chèn dư chữ 'more' trước một tính từ ngắn đã được thêm đuôi '-er'." },
    eng_a2_superlative_missing_the: { label: "So sánh nhất (Thiếu 'the')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh nhất. Bạn hãy sinh ra đáp án nhiễu bằng cách lược bỏ mạo từ 'the' đứng trước cấu trúc so sánh nhất." },
    eng_a2_irregular_adj: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy tạo đáp án nhiễu bằng cách chia sai tính từ bất quy tắc (như good/bad) theo công thức thêm đuôi thông thường." },
    eng_a2_modal_plus_to: { label: "Động từ khuyết thiếu (+to)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy sinh ra đáp án nhiễu bằng cách chèn thừa giới từ 'to' vào ngay sau động từ khuyết thiếu." },
    eng_a2_modal_plus_ving: { label: "Động từ khuyết thiếu (+V-ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo đáp án nhiễu bằng cách chia động từ ở dạng V-ing thay vì nguyên thể ngay sau động từ khuyết thiếu." },
    eng_a2_have_to_conjugation: { label: "Cấu trúc Have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Have to. Bạn hãy sinh ra đáp án nhiễu bằng cách quên chia 'have to' thành 'has to' đối với chủ ngữ ngôi thứ 3 số ít." },
    eng_a2_mustn_dont_have_to: { label: "Mustn't và Don't have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mustn\\'t và Don\\'t have to. Hãy tạo đáp án nhiễu bằng cách tráo đổi ý nghĩa giữa sự cấm đoán và sự không bắt buộc." },
    eng_a2_much_many: { label: "Much/Many", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Much/Many. Bạn hãy sinh ra đáp án nhiễu bằng cách dùng 'many' cho danh từ không đếm được hoặc 'much' cho danh từ số nhiều." },
    eng_a2_few_little: { label: "A few/A little", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: A few/A little. Hãy tạo đáp án nhiễu bằng cách dùng sai 'a few' cho danh từ không đếm được hoặc ngược lại." },
    eng_a2_make_do_swap: { label: "Collocation Make/Do", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Collocation Make/Do. Bạn hãy sinh ra đáp án nhiễu bằng cách tráo đổi cách dùng giữa động từ 'make' và 'do' trong các cụm cố định." },
    eng_a2_phrasal_prep: { label: "Cụm động từ (Phrasal Verbs)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ (Phrasal Verbs). Hãy tạo đáp án nhiễu bằng cách thay thế sai giới từ đi kèm trong các cụm động từ quen thuộc." },
    
    // Bẫy Tiếng Anh (General Legacy)
    eng_article_an: { label: "Mạo từ A/An", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ A/An. Hãy tạo các đáp án nhiễu tự nhiên bằng cách dùng sai mạo từ trước nguyên âm/phụ âm." },
    eng_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ số nhiều. Bạn hãy sinh ra các đáp án nhiễu bằng cách áp dụng sai quy tắc thêm 's'/'es' hoặc chia sai danh từ bất quy tắc." },
    eng_present_cont: { label: "Hiện tại tiếp diễn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Hãy thử tạo nhiễu bằng cách bỏ quên động từ To Be hoặc không chia đuôi '-ing'." },
    eng_this_these: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Bạn hãy tạo đáp án nhiễu sử dụng sai sự phối hợp số ít/số nhiều (VD: These car)." },
    eng_past_irregular: { label: "Quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ bất quy tắc. Hãy sáng tạo đáp án nhiễu bằng cách tự ý thêm đuôi '-ed' vào các động từ bất quy tắc thay vì dùng dạng V2." },
    eng_comparative_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh hơn. Bạn hãy tạo nhiễu bằng cách dùng cấu trúc so sánh kép (more + tính từ ngắn + er) hoặc chia sai dạng từ." },
    eng_much_many: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ. Hãy tạo đáp án nhiễu bằng cách đảo lộn cách dùng của much và many cho các loại danh từ đếm được/không đếm được." },
    eng_since_for: { label: "Hiện tại hoàn thành (Since/For)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại hoàn thành. Bạn hãy thử tạo nhiễu bằng cách đảo ngược ngữ cảnh sử dụng của Since (mốc) và For (khoảng thời gian)." },
    eng_passive_missing_be: { label: "Câu bị động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu bị động. Hãy sáng tạo đáp án nhiễu sai cấu trúc bằng cách bỏ quên động từ to be hoặc dùng V1 thay vì V3." },
    eng_vietglish_collocation: { label: "Cụm từ cố định (Collocation)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm từ cố định (Collocation). Bạn hãy tạo nhiễu bằng cách dịch word-by-word một cách tự nhiên từ tiếng Việt sang tiếng Anh." }
  },

  // ====================================================
  // GAME TÌM LỖI SAI (SPOT MISTAKE) - TẠO LỖI 1-VỊ-TRÍ
  // ====================================================
  spot_mistake: {
    // Bẫy Tiếng Trung (HSK 1)
    zh_hsk1_pronoun_gender: { label: "Đại từ nhân xưng (Giới tính)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy bóp méo câu bằng cách hoán đổi đại từ giới tính (他/她) sai với nhân vật." },
    zh_hsk1_pronoun_location: { label: "Đại từ chỉ thị (Vật/Nơi chốn)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách dùng đại từ chỉ vật (这/那) thay cho đại từ chỉ địa điểm (这儿/那儿) hoặc ngược lại." },
    zh_hsk1_question_quantity: { label: "Từ để hỏi số lượng (几/多少)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách tráo đổi 几 và 多少, hoặc bỏ quên lượng từ đi sau chữ 几." },
    zh_hsk1_number_liang: { label: "Số lượng từ (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai kinh điển bằng cách dùng số đếm 二 thay cho lượng số 两 trước lượng từ." },
    zh_hsk1_measure_mismatch: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dùng một lượng từ hoàn toàn không phù hợp với danh từ đi kèm." },
    zh_hsk1_negation_bumei: { label: "Phủ định (不/没)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai bằng cách dùng chữ 不 để phủ định động từ 有 hoặc phủ định một hành động trong quá khứ." },
    zh_hsk1_modal_ability: { label: "Động từ năng nguyện (会/能)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách hoán đổi cách sử dụng của hai động từ năng nguyện 会 và 能." },
    zh_hsk1_verb_direction: { label: "Hướng di chuyển (去/来)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai bằng cách dùng ngược hướng di chuyển (thay 去 bằng 来 hoặc ngược lại)." },
    zh_hsk1_adj_predicate_shi: { label: "Vị ngữ tính từ (Thừa 是)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách chèn động từ 是 vào trước tính từ làm vị ngữ." },
    zh_hsk1_particle_de_redundant: { label: "Trợ từ 的", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai bằng cách lạm dụng trợ từ 的 (sở hữu kép) hoặc xóa bỏ nó ở cụm danh từ phức tạp." },
    zh_hsk1_exclam_tai_le: { label: "Cấu trúc cảm thán 太...了", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách gắn đuôi 了 vào sau cấu trúc phủ định 不太." },
    zh_hsk1_question_ma_ne: { label: "Trợ từ nghi vấn (吗/呢)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai bằng cách chèn chữ 吗 vào một câu đã có từ để hỏi (như 谁, 什么)." },
    zh_hsk1_serial_verb_order: { label: "Câu liên động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dời cụm từ chỉ địa điểm ra phía sau động từ chính." },
    zh_hsk1_time_order: { label: "Trạng ngữ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bạn hãy tạo lỗi sai bằng cách dời trạng ngữ chỉ thời gian xuống cuối câu." },
    zh_hsk1_place_order: { label: "Trạng ngữ địa điểm (在)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dời cụm giới từ 在 + Địa điểm ra phía sau động từ chính." },
    
    // Bẫy Tiếng Trung (HSK 2)
    zh_hsk2_pronoun_ta_mismatch: { label: "Đại từ chỉ người/vật", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dùng sai đại từ chỉ người (他/她) cho đồ vật/động vật, hoặc ngược lại." },
    zh_hsk2_pronoun_mei_measure: { label: "Đại từ 每", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách xóa bỏ lượng từ đứng giữa đại từ 每 và danh từ." },
    zh_hsk2_number_er_liang: { label: "Số lượng (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dùng số đếm 二 thay cho lượng số 两 khi đứng trước lượng từ." },
    zh_hsk2_measure_mismatch: { label: "Lượng từ chuyên biệt", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách dùng một lượng từ hoàn toàn sai lệch với danh từ đặc trưng (như dùng 张 cho quần áo)." },
    zh_hsk2_adv_you_zai: { label: "Phó từ lặp lại (又/再)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách tráo đổi cách dùng của phó từ lặp lại 又 và 再." },
    zh_hsk2_adv_jiu_pos: { label: "Phó từ 就", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách dời phó từ 就 lên trước danh từ chỉ thời gian." },
    zh_hsk2_prep_gei_order: { label: "Giới từ 给", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dời cụm giới từ 给 + Tân ngữ ra phía sau động từ chính." },
    zh_hsk2_conj_missing_pair: { label: "Câu ghép (Thiếu vế)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách xóa bỏ một vế của cặp liên từ hô ứng (ví dụ có 因为 nhưng mất 所以)." },
    zh_hsk2_conj_logic_clash: { label: "Logic liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách ghép hai nửa của hai cặp liên từ khác nhau (như 因为... 但是...)." },
    zh_hsk2_state_comp_missing_verb: { label: "Bổ ngữ trạng thái (Thiếu động từ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách không lặp lại động từ trước chữ 得 khi câu có tân ngữ." },
    zh_hsk2_state_comp_obj_pos: { label: "Bổ ngữ trạng thái (Vị trí tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dời tân ngữ ra phía sau trợ từ 得." },
    zh_hsk2_compare_bi_adv: { label: "Câu so sánh 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách chèn thừa một phó từ mức độ (như 很, 非常) vào trước tính từ trong câu so sánh 比." },
    zh_hsk2_prog_zhengzai_clash: { label: "Trạng thái tiếp diễn 正在", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách thay 正在 bằng 已经 nhưng vẫn giữ nguyên đuôi 呢." },
    zh_hsk2_approx_duo_less10: { label: "Ước lượng số nhỏ (<10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách dời chữ 多 lên trước lượng từ đối với số đếm nhỏ hơn 10." },
    zh_hsk2_approx_duo_more10: { label: "Ước lượng số lớn (>=10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dời chữ 多 ra sau lượng từ đối với số chẵn từ 10 trở lên." },
    zh_hsk2_prep_cong_li: { label: "Giới từ khoảng cách (从/离)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy tạo lỗi sai bằng cách dùng Từ chỉ điểm xuất phát (从) thay cho Từ chỉ khoảng cách (离)." },
    zh_hsk2_aspect_zhe_le: { label: "Trợ từ động thái (着/了)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy bóp méo câu bằng cách dùng trợ từ 了 thay cho trợ từ 着 trong ngữ cảnh đang duy trì trạng thái." },
    
    // Bẫy Tiếng Trung (HSK Legacy - Dành cho HSK 3/4)
    zh_hsk_separable_obj: { label: "Động từ Ly hợp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Động từ ly hợp. Bạn hãy khéo léo bóp méo câu gốc bằng cách gắn tân ngữ trực tiếp vào ngay sau động từ ly hợp để tạo một lỗi sai tự nhiên." },
    zh_hsk_adv_zhongyu: { label: "Phó từ 终于", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào phó từ 终于. Bạn hãy tạo một lỗi sai tinh tế bằng cách dịch chuyển vị trí của 终于 ra sau động từ chính." },
    zh_hsk_adv_degree: { label: "Phó từ chỉ mức độ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tập trung vào phó từ mức độ. Hãy thử bóp méo cấu trúc 越...越... hoặc dùng phó từ 极 mà cố ý để sót chữ 了." },
    zh_hsk_prep_mismatch: { label: "Giới từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Giới từ. Bạn hãy tạo lỗi sai bằng cách thay thế giới từ đúng bằng một giới từ khác không hợp văn cảnh (VD: thay 根据 bằng 关于)." },
    zh_hsk_conj_mismatch: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Liên từ. Hãy sáng tạo một lỗi sai bằng cách phá vỡ cặp liên từ 不但...而且..., ghép sai với một liên từ khác." },
    zh_hsk_noun_space: { label: "Danh từ không gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ không gian. Bạn hãy thêm các phương vị từ như 上, 里 vào sau những danh từ đã vốn mang nghĩa địa điểm để tạo lỗi dư thừa." },
    zh_hsk_rc_negation: { label: "Phủ định Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Phủ định Bổ ngữ kết quả. Hãy tạo lỗi sai bằng cách dùng chữ 不 để phủ định một hành động đã hoàn tất trong quá khứ." },
    zh_hsk_rc_state: { label: "Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ kết quả. Bạn hãy thay đổi bổ ngữ kết quả bằng một từ mang ý nghĩa trái ngược với logic thực tế của câu." },
    zh_hsk_pc_ability: { label: "Bổ ngữ Khả năng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ khả năng. Hãy tạo lỗi sai bằng cách nhầm lẫn cấu trúc 得/不 với động từ năng nguyện 能/不能." },
    zh_hsk_dc_location: { label: "Bổ ngữ Xu hướng (Vị trí)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ xu hướng. Hãy bóp méo câu bằng cách dời Tân ngữ Địa điểm ra sau động từ xu hướng 来 hoặc 去." },
    zh_hsk_dc_direction: { label: "Bổ ngữ Xu hướng (Hướng)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ xu hướng. Bạn hãy tạo lỗi sai bằng cách chọn sai chữ 来 hoặc 去, khiến nó ngược lại với hướng đi của nhân vật." },
    zh_hsk_ba_indefinite: { label: "Câu chữ 把 (Tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Hãy tạo lỗi sai bằng cách đổi Tân ngữ thành một cụm số lượng không xác định (như 一本书)." },
    zh_hsk_ba_result: { label: "Câu chữ 把 (Kết quả)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Bạn hãy bóp méo bằng cách loại bỏ phần kết quả hoặc cách xử lý đứng sau động từ chính." },
    zh_hsk_bei_reverse: { label: "Câu chữ 被", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 被. Hãy tạo một lỗi sai thú vị bằng cách hoán đổi logic giữa người tác động và người bị tác động." },
    zh_hsk_exist_order: { label: "Câu tồn tại với 着", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu tồn tại (着). Bạn hãy tạo lỗi sai bằng cách dời Trạng ngữ chỉ Nơi chốn ra phía sau cụm Động từ." },
    zh_hsk_emph_order: { label: "Cấu trúc nhấn mạnh 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu nhấn mạnh 连...也/都. Hãy bóp méo câu bằng cách xếp đối tượng nhấn mạnh ra sau chữ 也 hoặc 都." },
    zh_hsk_emph_extreme: { label: "Cấu trúc 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu nhấn mạnh 连...也/都. Bạn hãy làm sai lệch câu bằng cách đổi đối tượng nhấn mạnh thành một sự vật hết sức bình thường." },
    zh_hsk_paired_only_if: { label: "Cặp 只有...才...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cặp 只有...才... Hãy tạo lỗi sai bằng cách thay từ hô ứng 才 bằng chữ 就." },
    zh_hsk_paired_as_long_as: { label: "Cặp 只要...就...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cặp 只要...就... Hãy tạo lỗi sai bằng cách thay từ hô ứng 就 bằng chữ 才." },
    zh_hsk_dist_li: { label: "Khoảng cách với 离", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Khoảng cách với 离. Bạn hãy bóp méo bằng cách thay chữ 离 bằng chữ 从." },
    zh_hsk_comp_bi: { label: "Câu so sánh với 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu so sánh 比. Hãy tạo lỗi sai bằng cách tự nhiên thêm phó từ mức độ (như 很 hoặc 非常) vào trước tính từ." },
    zh_hsk_except_chule: { label: "Ngoại trừ 除了...以外", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 除了...以外. Bạn hãy tạo lỗi sai bằng cách thay thế chữ 还 hoặc 也 ở vế sau bằng chữ 但是." },
    general_mistake: { label: "Lỗi tổng hợp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lỗi tổng hợp. Hãy sáng tạo một lỗi sai duy nhất bằng cách thay đổi một từ vựng bất kỳ sao cho không phù hợp với văn cảnh." },
    
    // Bẫy Tiếng Anh (Pre-A1)
    pre_a1_article_an: { label: "Mạo từ (A/An)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ. Bạn hãy khéo léo tạo một lỗi sai bằng cách dùng sai mạo từ a/an trước từ bắt đầu bằng nguyên âm/phụ âm." },
    pre_a1_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ số nhiều. Hãy bóp méo câu bằng cách loại bỏ chữ 's' ở danh từ số nhiều, hoặc thêm 's' vào danh từ số ít." },
    pre_a1_tobe_match: { label: "Động từ To be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ To be. Bạn hãy tạo một lỗi sai bằng cách ghép lệch pha giữa đại từ nhân xưng và động từ to be." },
    pre_a1_this_that: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Hãy làm sai lệch câu bằng cách hoán đổi This và That không hợp với khoảng cách vật lý." },
    pre_a1_like_plural: { label: "Cấu trúc sở thích", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Like. Bạn hãy tạo lỗi sai bằng cách dùng danh từ đếm được số ít (không có s) ngay phía sau động từ like." },
    pre_a1_commands: { label: "Câu mệnh lệnh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu mệnh lệnh. Hãy bóp méo câu phủ định bằng cách thay thế chữ Don\\'t bằng chữ No." },
    pre_a1_adj_order: { label: "Trật tự Tính từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trật tự tính từ. Bạn hãy tạo một lỗi sai quen thuộc bằng cách dời tính từ ra phía sau danh từ." },
    pre_a1_he_she: { label: "Giới tính Đại từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ giới tính. Hãy bóp méo câu bằng cách dùng He thay cho nữ và She thay cho nam." },
    pre_a1_have_has: { label: "Động từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ sở hữu. Bạn hãy tạo một lỗi sai tự nhiên bằng cách chia nhầm have/has theo chủ ngữ." },
    pre_a1_prepositions: { label: "Giới từ vị trí", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ vị trí. Hãy thay thế in/on/under bằng một giới từ khác để tạo ra một ngữ cảnh vô lý." },
    pre_a1_yesno_order: { label: "Câu hỏi Yes/No", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi Yes/No. Bạn hãy bóp méo bằng cách xếp trật tự từ như câu khẳng định bình thường nhưng để dấu chấm hỏi ở cuối." },
    pre_a1_can_cant: { label: "Khả năng (Can/Can't)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Khả năng. Hãy tạo một lỗi sai bằng cách thêm giới từ 'to' vào ngay sau động từ khuyết thiếu can." },
    
    // Bẫy Tiếng Anh (A1)
    eng_a1_pres_3rd_person: { label: "Động từ ngôi thứ 3 số ít", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ ngôi thứ 3 số ít. Hãy bóp méo câu bằng cách lược bỏ 's/es' ở động từ chính, hoặc thêm 's' sai quy tắc." },
    eng_a1_pres_tobe_verb_clash: { label: "Lỗi thừa To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lỗi thừa To Be. Hãy bóp méo câu bằng cách chèn thừa động từ To Be vào trước động từ thường (ví dụ: I am like)." },
    eng_a1_pres_auxiliary: { label: "Trợ động từ phủ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trợ động từ phủ định. Bạn hãy tạo lỗi sai bằng cách dùng 'don\\'t' thay vì 'doesn\\'t' hoặc ngược lại một cách tự nhiên." },
    eng_a1_adv_frequency_pos: { label: "Vị trí trạng từ tần suất", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí trạng từ tần suất. Hãy bóp méo câu bằng cách đặt trạng từ tần suất sai vị trí (trước To Be hoặc sau động từ thường)." },
    eng_a1_pres_cont_missing_be: { label: "Hiện tại tiếp diễn (Thiếu To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Bạn hãy tạo lỗi sai bằng cách lược bỏ hoàn toàn động từ To Be, chỉ giữ lại phần V-ing." },
    eng_a1_pres_cont_base_verb: { label: "Hiện tại tiếp diễn (Thiếu -ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Hãy bóp méo câu bằng cách bỏ đuôi '-ing' của động từ, giữ lại dạng nguyên thể đứng sau To Be." },
    eng_a1_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Bạn hãy tạo lỗi sai bằng cách đổi động từ sang thì hiện tại tiếp diễn dù câu có trạng từ của hiện tại đơn, hoặc ngược lại." },
    eng_a1_past_tobe_agreement: { label: "Quá khứ To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ To Be. Hãy bóp méo câu bằng cách chia sai số ít/số nhiều của động từ 'was/were'." },
    eng_a1_past_tobe_verb_clash: { label: "Quá khứ đơn (Thừa To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Bạn hãy tạo lỗi sai bằng cách chèn thừa 'was/were' vào trước một động từ đã được chia quá khứ (V-ed)." },
    eng_a1_past_missing_ed: { label: "Quá khứ đơn (Thiếu -ed)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Hãy bóp méo câu bằng cách để động từ ở dạng nguyên thể thay vì chia quá khứ dù có trạng từ chỉ thời gian." },
    eng_a1_modal_can_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy tạo lỗi sai bằng cách chèn thêm giới từ 'to' vào giữa 'can' và động từ chính." },
    eng_a1_modal_can_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy bóp méo câu bằng cách tự ý thêm 's' vào động từ đi sau 'can' khi chủ ngữ là ngôi thứ 3 số ít." },
    eng_a1_would_like: { label: "Cấu trúc Would like", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Would like. Bạn hãy tạo lỗi sai bằng cách loại bỏ chữ 'would', chỉ dùng 'like' trong ngữ cảnh gọi món." },
    eng_a1_possessive_adj: { label: "Tính từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ sở hữu. Hãy bóp méo câu bằng cách thay thế tính từ sở hữu bằng một đại từ nhân xưng (như me, you, he)." },
    eng_a1_demonstrative_clash: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Bạn hãy tạo lỗi sai bằng cách hoán đổi This/That cho danh từ số nhiều hoặc These/Those cho danh từ số ít." },
    eng_a1_uncountable_plural: { label: "Danh từ không đếm được", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ không đếm được. Hãy bóp méo câu bằng cách đối xử với danh từ không đếm được như danh từ đếm được (thêm 's')." },
    eng_a1_prep_time: { label: "Giới từ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ thời gian. Bạn hãy tạo lỗi sai bằng cách thay thế in/on/at bằng một giới từ sai quy tắc." },
    eng_a1_prep_place_vn: { label: "Giới từ nơi chốn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ nơi chốn. Hãy bóp méo câu bằng cách dịch word-by-word giới từ từ tiếng Việt (ví dụ: dùng on thay vì in)." },
    eng_a1_conjunction_logic: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Bạn hãy tạo lỗi sai bằng cách dùng sai liên từ chỉ nguyên nhân (because) thành tương phản (but) hoặc ngược lại." },
    eng_a1_wh_question_match: { label: "Từ để hỏi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Từ để hỏi. Hãy bóp méo câu hỏi bằng cách dùng từ Wh- không phù hợp với câu trả lời tương ứng." },
    
    // Bẫy Tiếng Anh (A1+)
    eng_a1p_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Bạn hãy tạo lỗi sai bằng cách dùng thì hiện tại đơn với dấu hiệu tiếp diễn, hoặc ngược lại." },
    eng_a1p_past_ed: { label: "Động từ quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ bất quy tắc. Hãy bóp méo câu bằng cách gắn đuôi '-ed' vào một động từ bất quy tắc." },
    eng_a1p_past_double: { label: "Quá khứ phủ định/nghi vấn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ phủ định/nghi vấn. Bạn hãy tạo lỗi sai bằng cách chia động từ ở quá khứ dù đã có trợ động từ 'did/didn\\'t'." },
    eng_a1p_past_be_vs_do: { label: "To be và Trợ động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: To be và Trợ động từ. Hãy làm sai lệch câu bằng cách thay 'was/were' bằng 'did', hoặc ngược lại." },
    eng_a1p_comp_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh hơn. Bạn hãy tạo lỗi sai bằng cách dùng cấu trúc so sánh kép (có cả 'more' và '-er')." },
    eng_a1p_comp_irregular: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy bóp méo câu bằng cách gắn đuôi '-er' vào tính từ bất quy tắc." },
    eng_a1p_comp_than: { label: "Giới từ so sánh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ so sánh. Bạn hãy tạo lỗi sai bằng cách xóa bỏ chữ 'than' hoặc thay bằng 'that'/'then'." },
    eng_a1p_quant_some_any: { label: "Some/Any", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Some/Any. Hãy làm sai lệch câu bằng cách đổi 'some' thành 'any' trong câu khẳng định, hoặc ngược lại trong phủ định." },
    eng_a1p_quant_much_many: { label: "Lượng từ (Much/Many)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ. Bạn hãy tạo lỗi sai bằng cách đổi chỗ 'much' và 'many' cho nhau." },
    eng_a1p_quant_a_lot_of: { label: "Lượng từ (A lot of)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ A lot of. Hãy bóp méo câu bằng cách xóa bỏ giới từ 'of' trong cụm này." },
    eng_a1p_conj_because_so: { label: "Liên từ (Because/So)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Bạn hãy tạo lỗi sai bằng cách dùng song song cả 'because' và 'so' trong cùng một câu ghép." },
    eng_a1p_adv_very_verb: { label: "Trạng từ Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Very. Hãy làm sai lệch câu bằng cách đặt chữ 'very' ngay trước động từ thường." },
    eng_a1p_adv_too_much: { label: "Trạng từ Too/Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Too/Very. Bạn hãy tạo lỗi sai bằng cách dùng 'too' thay vì 'very' để biểu đạt ý khen ngợi." },
    eng_a1p_job_article: { label: "Mạo từ nghề nghiệp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ nghề nghiệp. Hãy bóp méo câu bằng cách xóa bỏ mạo từ 'a/an' trước danh từ nghề nghiệp." },
    eng_a1p_modal_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy tạo lỗi sai bằng cách chèn chữ 'to' vào sau động từ khuyết thiếu." },
    eng_a1p_modal_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy làm sai lệch câu bằng cách thêm 's' vào động từ khuyết thiếu hoặc động từ chính khi chủ ngữ là he/she/it." },
    eng_a1p_emotion_ed_ing: { label: "Tính từ chỉ cảm xúc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ chỉ cảm xúc. Bạn hãy tạo lỗi sai bằng cách hoán đổi đuôi '-ed' và '-ing' của tính từ." },
    eng_a1p_tag_question: { label: "Câu hỏi đuôi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi đuôi. Hãy bóp méo phần đuôi câu hỏi bằng cách giữ nguyên thể khẳng định/phủ định thay vì đảo cực." },
    eng_a1p_phrasal_prep: { label: "Cụm động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ. Bạn hãy tạo lỗi sai bằng cách lược bỏ giới từ trong phrasal verb." },
    eng_a1p_time_quarter: { label: "Thời gian (Past/To)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thời gian. Hãy làm sai lệch thời gian bằng cách đổi 'past' thành 'to' hoặc ngược lại." },
    
    // Bẫy Tiếng Anh (A2)
    eng_a2_past_interrupt: { label: "Hành động cắt ngang", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hành động cắt ngang. Bạn hãy tạo lỗi sai bằng cách đảo ngược thì giữa hành động đang xảy ra (quá khứ tiếp diễn) và hành động cắt ngang (quá khứ đơn)." },
    eng_a2_pres_perf_form: { label: "Hiện tại hoàn thành", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại hoàn thành. Hãy bóp méo câu bằng cách lược bỏ trợ động từ have/has hoặc dùng quá khứ V2 thay vì V3/ed." },
    eng_a2_pres_perf_ever: { label: "Vị trí Ever/Never", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí Ever/Never. Bạn hãy tạo lỗi sai bằng cách đặt từ ever hoặc never sai vị trí trong câu hiện tại hoàn thành." },
    eng_a2_future_will_going: { label: "Thì tương lai", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thì tương lai. Hãy bóp méo câu bằng cách lược bỏ to-be trong cấu trúc 'be going to' hoặc dùng 'will' cho kế hoạch định sẵn." },
    eng_a2_although_but: { label: "Mặc dù... nhưng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mặc dù... nhưng. Bạn hãy tạo lỗi sai kinh điển bằng cách chèn thừa chữ 'but' vào mệnh đề chính sau 'Although'." },
    eng_a2_because_so: { label: "Bởi vì... cho nên", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bởi vì... cho nên. Hãy tạo lỗi sai bằng cách chèn thừa chữ 'so' vào mệnh đề chính sau 'Because'." },
    eng_a2_if_type1_will: { label: "Câu điều kiện loại 1", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu điều kiện loại 1. Bạn hãy bóp méo câu bằng cách nhét thừa trợ động từ 'will' vào ngay mệnh đề giả thiết 'If'." },
    eng_a2_when_while_swap: { label: "When/While", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: When/While. Hãy tạo lỗi sai bằng cách hoán đổi cách dùng của 'While' và 'When' cho hành động đang diễn ra và cắt ngang." },
    eng_a2_adv_of_manner: { label: "Trạng từ thể cách", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ thể cách. Bạn hãy bóp méo câu bằng cách dùng một Tính từ thay vì Trạng từ để bổ nghĩa cho động từ thường." },
    eng_a2_comparative_double: { label: "So sánh kép", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh kép. Hãy tạo lỗi sai bằng cách nhét thừa chữ 'more' trước một tính từ ngắn đã có đuôi '-er'." },
    eng_a2_superlative_missing_the: { label: "So sánh nhất (Thiếu 'the')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh nhất. Bạn hãy tạo lỗi sai bằng cách lược bỏ mạo từ 'the' phía trước cấu trúc so sánh nhất." },
    eng_a2_irregular_adj: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy bóp méo câu bằng cách chia sai tính từ bất quy tắc theo công thức thêm đuôi thông thường." },
    eng_a2_modal_plus_to: { label: "Động từ khuyết thiếu (+to)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy tạo lỗi sai bằng cách chèn thừa giới từ 'to' vào sau động từ khuyết thiếu." },
    eng_a2_modal_plus_ving: { label: "Động từ khuyết thiếu (+V-ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo lỗi sai bằng cách chia động từ ở dạng V-ing thay vì nguyên thể sau modal verb." },
    eng_a2_have_to_conjugation: { label: "Cấu trúc Have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Have to. Bạn hãy bóp méo câu bằng cách chia sai 'have to' thành 'has to' hoặc ngược lại so với chủ ngữ." },
    eng_a2_mustn_dont_have_to: { label: "Mustn't và Don't have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mustn\\'t và Don\\'t have to. Hãy tạo lỗi sai bằng cách tráo đổi ý nghĩa giữa sự cấm đoán và sự không bắt buộc." },
    eng_a2_much_many: { label: "Much/Many", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Much/Many. Bạn hãy bóp méo câu bằng cách dùng sai 'many' cho danh từ không đếm được hoặc ngược lại." },
    eng_a2_few_little: { label: "A few/A little", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: A few/A little. Hãy tạo lỗi sai bằng cách hoán đổi cách dùng 'a few' và 'a little' cho các loại danh từ." },
    eng_a2_make_do_swap: { label: "Collocation Make/Do", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Collocation Make/Do. Bạn hãy bóp méo câu bằng cách hoán đổi động từ 'make' và 'do' trong các cụm cố định." },
    eng_a2_phrasal_prep: { label: "Cụm động từ (Phrasal Verbs)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ. Hãy tạo lỗi sai bằng cách dùng sai giới từ đi kèm trong các Phrasal Verbs phổ biến." },
    
    // Bẫy Tiếng Anh (General Legacy)
    eng_article_an: { label: "Mạo từ A/An", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ A/An. Bạn hãy bóp méo câu bằng cách đảo ngược cách dùng mạo từ trước nguyên âm/phụ âm." },
    eng_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ số nhiều. Hãy tạo một lỗi sai bằng cách chia sai dạng số nhiều của danh từ bất quy tắc." },
    eng_present_cont: { label: "Hiện tại tiếp diễn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Bạn hãy tạo lỗi sai bằng cách lược bỏ động từ To be trong câu đang diễn ra." },
    eng_this_these: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Hãy làm sai lệch câu bằng cách dùng sai sự phối hợp số ít và số nhiều." },
    eng_past_irregular: { label: "Quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Bạn hãy tạo lỗi sai bằng cách cố tình gắn đuôi -ed vào một động từ bất quy tắc." },
    eng_comparative_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh hơn. Hãy bóp méo bằng cách thêm dư chữ 'more' vào trước tính từ ngắn đã có đuôi -er." },
    eng_much_many: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ. Bạn hãy tạo lỗi sai bằng cách thay thế much bằng many hoặc ngược lại cho các loại danh từ." },
    eng_since_for: { label: "Hiện tại hoàn thành (Since/For)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Since/For. Hãy bóp méo câu bằng cách hoán đổi cách sử dụng của Since và For." },
    eng_passive_missing_be: { label: "Câu bị động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu bị động. Bạn hãy tạo một lỗi sai bằng cách xóa bỏ động từ to be, để lại động từ chính ở dạng V3." },
    eng_vietglish_collocation: { label: "Cụm từ cố định (Collocation)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Collocation. Hãy bóp méo bằng cách dùng một động từ dịch sát nghĩa đen từ tiếng Việt nhưng sai trong tiếng Anh." }
  },

  // ====================================================
  // GAME ĐIỀN TỪ (FILL BLANK) - ĐỤC CHỖ HIỂM & SINH NHIỄU
  // ====================================================
  fill_blank: {
    // Bẫy Tiếng Trung (HSK 1)
    zh_hsk1_pronoun_gender: { label: "Đại từ nhân xưng (Giới tính)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ nhân xưng. Hãy sinh ra các đại từ nhiễu mang giới tính hoặc số lượng không phù hợp." },
    zh_hsk1_pronoun_location: { label: "Đại từ chỉ thị (Vật/Nơi chốn)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ chỉ thị. Hãy sinh ra các đại từ chỉ vật nhiễu thay vì đại từ chỉ nơi chốn." },
    zh_hsk1_question_quantity: { label: "Từ để hỏi số lượng (几/多少)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Từ để hỏi số lượng. Hãy sinh ra các đáp án nhiễu là 几 hoặc 多少 không hợp logic ngữ pháp." },
    zh_hsk1_number_liang: { label: "Số lượng từ (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Số lượng từ 两. Hãy đưa ra số đếm 二 hoặc các số khác làm đáp án nhiễu." },
    zh_hsk1_measure_mismatch: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Lượng từ. Hãy sinh ra các lượng từ nhiễu hoàn toàn không khớp với danh từ phía sau." },
    zh_hsk1_negation_bumei: { label: "Phủ định (不/没)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ phủ định. Hãy đưa ra các đáp án nhiễu sai thì hoặc sai cấu trúc (như dùng 不 cho quá khứ)." },
    zh_hsk1_modal_ability: { label: "Động từ năng nguyện (会/能)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ năng nguyện. Hãy sinh ra các động từ nhiễu sai bản chất khả năng (như dùng 会 thay cho 能)." },
    zh_hsk1_verb_direction: { label: "Hướng di chuyển (去/来)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ hướng di chuyển. Hãy đưa ra động từ hướng ngược lại làm đáp án nhiễu." },
    zh_hsk1_adj_predicate_shi: { label: "Vị ngữ tính từ (Thừa 是)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ mức độ trước Tính từ. Hãy đưa ra động từ 是 hoặc các phó từ sai làm nhiễu." },
    zh_hsk1_particle_de_redundant: { label: "Trợ từ 的", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ từ 的. Hãy sinh ra các trợ từ kết cấu khác (như 得, 地) làm đáp án nhiễu." },
    zh_hsk1_exclam_tai_le: { label: "Cấu trúc cảm thán 太...了", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 太 hoặc 了. Hãy sinh ra các phó từ hoặc trợ từ nhiễu làm hỏng cấu trúc cảm thán." },
    zh_hsk1_question_ma_ne: { label: "Trợ từ nghi vấn (吗/呢)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ từ nghi vấn. Hãy sinh ra các trợ từ nhiễu sai chức năng (như 呢 thay cho 吗)." },
    zh_hsk1_serial_verb_order: { label: "Câu liên động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ đi lại (去/来). Hãy đưa ra các động từ nhiễu làm hỏng logic chuỗi hành động." },
    zh_hsk1_time_order: { label: "Trạng ngữ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trạng ngữ thời gian. Hãy đưa ra các trạng từ nhiễu có mốc thời gian mâu thuẫn với câu." },
    zh_hsk1_place_order: { label: "Trạng ngữ địa điểm (在)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ 在. Hãy đưa ra các giới từ nhiễu sai chức năng địa điểm." },
    
    // Bẫy Tiếng Trung (HSK 2)
    zh_hsk2_pronoun_ta_mismatch: { label: "Đại từ chỉ người/vật", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ. Hãy đưa ra các đại từ nhiễu sai bản chất người/vật (như 它 thay vì 他)." },
    zh_hsk2_pronoun_mei_measure: { label: "Đại từ 每", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Lượng từ sau chữ 每. Hãy đưa ra các danh từ hoặc phó từ nhiễu để đánh lừa." },
    zh_hsk2_number_er_liang: { label: "Số lượng (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Số lượng 两. Hãy đưa ra số đếm 二 hoặc các số sai khác làm đáp án nhiễu." },
    zh_hsk2_measure_mismatch: { label: "Lượng từ chuyên biệt", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Lượng từ. Hãy đưa ra các lượng từ nhiễu không phù hợp với danh từ phía sau." },
    zh_hsk2_adv_you_zai: { label: "Phó từ lặp lại (又/再)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ 又 hoặc 再. Hãy đưa ra từ còn lại làm đáp án nhiễu để bẫy logic thời gian." },
    zh_hsk2_adv_jiu_pos: { label: "Phó từ 就", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ 就. Hãy đưa ra các phó từ nhiễu sai ngữ nghĩa hoặc sai cấu trúc nhấn mạnh." },
    zh_hsk2_prep_gei_order: { label: "Giới từ 给", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ 给. Hãy đưa ra các giới từ nhiễu sai chức năng (như 对, 从)." },
    zh_hsk2_conj_missing_pair: { label: "Câu ghép (Thiếu vế)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại một vế của Liên từ hô ứng. Hãy đưa ra các liên từ nhiễu sai cặp (như 但是 thay cho 所以)." },
    zh_hsk2_conj_logic_clash: { label: "Logic liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Liên từ. Hãy đưa ra các liên từ nhiễu gây xung đột logic nguyên nhân - tương phản." },
    zh_hsk2_state_comp_missing_verb: { label: "Bổ ngữ trạng thái (Thiếu động từ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ lặp lại trước chữ 得. Hãy đưa ra các danh từ hoặc phó từ làm đáp án nhiễu." },
    zh_hsk2_state_comp_obj_pos: { label: "Bổ ngữ trạng thái (Vị trí tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ từ 得. Hãy đưa ra các trợ từ nhiễu (như 的, 地) hoặc đặt sai vị trí." },
    zh_hsk2_compare_bi_adv: { label: "Câu so sánh 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ trong câu so sánh 比. Hãy sinh ra đáp án nhiễu bằng cách gắn thừa chữ 很 hoặc 非常 trước tính từ." },
    zh_hsk2_prog_zhengzai_clash: { label: "Trạng thái tiếp diễn 正在", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ 正在. Hãy đưa ra phó từ nhiễu 已经 để gây xung đột với đuôi 呢." },
    zh_hsk2_approx_duo_less10: { label: "Ước lượng số nhỏ (<10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 多. Hãy đưa ra các phó từ hoặc lượng từ nhiễu sai cấu trúc." },
    zh_hsk2_approx_duo_more10: { label: "Ước lượng số lớn (>=10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 多. Hãy đưa ra các đáp án nhiễu đảo lộn vị trí của 多 và lượng từ." },
    zh_hsk2_prep_cong_li: { label: "Giới từ khoảng cách (从/离)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ 离 hoặc 从. Hãy đưa ra giới từ còn lại làm đáp án nhiễu chính." },
    zh_hsk2_aspect_zhe_le: { label: "Trợ từ động thái (着/了)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ từ 着. Hãy đưa ra trợ từ 了 hoặc 过 làm đáp án nhiễu." },
    
    // Bẫy Tiếng Trung (HSK Legacy - Dành cho HSK 3/4)
    zh_hsk_separable_obj: { label: "Động từ Ly hợp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Động từ ly hợp. Hãy sáng tạo 3 đáp án nhiễu là các động từ ly hợp bị ghép dính tân ngữ sai quy tắc hoặc mang ý nghĩa không phù hợp ngữ cảnh." },
    zh_hsk_adv_zhongyu: { label: "Phó từ 终于", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Phó từ 终于. Bạn hãy sinh ra các phó từ nhiễu chỉ thời gian/mức độ mâu thuẫn với kết quả ở vế sau (như 已经, 正在)." },
    zh_hsk_adv_degree: { label: "Phó từ chỉ mức độ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Phó từ mức độ (极, 越). Hãy tạo các phó từ nhiễu sai cấu trúc hô ứng hoặc không tương thích với văn cảnh (như 很, 非常)." },
    zh_hsk_prep_mismatch: { label: "Giới từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Giới từ (根据, 关于). Bạn hãy đưa ra các giới từ nhiễu sai hoàn toàn về ngữ nghĩa (như 对, 向, 为)." },
    zh_hsk_conj_mismatch: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Liên từ (不但, 而且). Hãy sáng tạo các liên từ nhiễu phá vỡ logic tăng tiến của câu (như 还是, 或者)." },
    zh_hsk_noun_space: { label: "Danh từ không gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Phương vị từ (上, 里). Bạn hãy sinh ra các từ chỉ phương hướng nhiễu ngược lại logic vật lý của ngữ cảnh (như 外, 下)." },
    zh_hsk_rc_negation: { label: "Phủ định Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Phó từ phủ định 没. Hãy dùng các từ phủ định nhiễu sai ngữ pháp đối với quá khứ (như 不, 别) để thử thách người học." },
    zh_hsk_rc_state: { label: "Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Bổ ngữ Kết quả. Bạn hãy sinh ra các Bổ ngữ nhiễu có ý nghĩa trái ngược hẳn với diễn biến của câu." },
    zh_hsk_pc_ability: { label: "Bổ ngữ Khả năng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Trợ từ 得 hoặc 不. Hãy tạo các đáp án nhiễu bằng trợ từ kết cấu hoặc động từ năng nguyện sai cấu trúc (như 的, 能)." },
    zh_hsk_dc_location: { label: "Bổ ngữ Xu hướng (Vị trí)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Tân ngữ Địa điểm. Hãy đưa ra các danh từ chung chung không mang tính địa điểm để làm nhiễu." },
    zh_hsk_dc_direction: { label: "Bổ ngữ Xu hướng (Hướng)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ xu hướng (来, 去). Bạn hãy sinh ra các hướng di chuyển nhiễu ngược lại với logic của câu chuyện." },
    zh_hsk_ba_indefinite: { label: "Câu chữ 把 (Tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Lượng từ/Chỉ thị từ trong câu chữ 把. Hãy tạo các đáp án nhiễu bằng những cụm số lượng từ không xác định (như 一, 几)." },
    zh_hsk_ba_result: { label: "Câu chữ 把 (Kết quả)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là phần Kết quả trong câu chữ 把. Bạn hãy sinh ra các động từ nhiễu độc lập không biểu đạt sự xử lý hay kết quả." },
    zh_hsk_bei_reverse: { label: "Câu chữ 被", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ bị động 被. Hãy dùng các giới từ nhiễu mang tính chủ động (như 把, 对) để đánh lừa chiều tác động." },
    zh_hsk_exist_order: { label: "Câu tồn tại với 着", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ từ động thái 着. Hãy tạo các đáp án nhiễu bằng những trợ từ sai quy tắc tồn tại (như 了, 过, 在)." },
    zh_hsk_emph_order: { label: "Cấu trúc nhấn mạnh 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 连. Bạn hãy đưa ra các phó từ/liên từ nhiễu không thể tạo cặp hô ứng với 也 hoặc 都." },
    zh_hsk_emph_extreme: { label: "Cấu trúc 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại phó từ hô ứng 也 hoặc 都. Hãy dùng các phó từ nhiễu không phù hợp trong câu nhấn mạnh (như 就, 才)." },
    zh_hsk_paired_only_if: { label: "Cặp 只有...才...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 才 hô ứng với 只有. Hãy sáng tạo các đáp án nhiễu phá vỡ cặp hô ứng điều kiện duy nhất này (như 就, 还)." },
    zh_hsk_paired_as_long_as: { label: "Cặp 只要...就...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 就 hô ứng với 只要. Hãy sáng tạo các đáp án nhiễu phá vỡ cặp hô ứng điều kiện đủ này (như 才, 还)." },
    zh_hsk_dist_li: { label: "Khoảng cách với 离", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 离. Bạn hãy sinh ra các giới từ nhiễu sai cấu trúc khoảng cách để đánh lừa (như 从, 在, 到)." },
    zh_hsk_comp_bi: { label: "Câu so sánh với 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 比. Hãy tạo các từ nối nhiễu sai hoàn toàn về ngữ cảnh so sánh (như 和, 跟)." },
    zh_hsk_except_chule: { label: "Ngoại trừ 除了...以外", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại cụm 除了 hoặc 以外. Hãy sinh ra các liên từ nhiễu có logic sai lệch hẳn (như 只有, 如果)." },
    general_blank: { label: "Đục lỗ Động từ/Tính từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Điểm đục lỗ là một Động từ/Tính từ then chốt. Hãy sáng tạo các đáp án nhiễu cùng từ loại nhưng mang ý nghĩa sai lệch với văn cảnh." },
    
    // Bẫy Tiếng Anh (Pre-A1)
    pre_a1_article_an: { label: "Mạo từ (A/An)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Mạo từ. Hãy sinh ra các mạo từ hoặc đại từ nhiễu sai quy tắc để đánh lừa người học." },
    pre_a1_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Danh từ. Bạn hãy sinh ra các danh từ nhiễu bị sai quy tắc số nhiều (thêm/bớt 's')." },
    pre_a1_tobe_match: { label: "Động từ To be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ To be. Hãy tạo các đáp án nhiễu là những to be bị chia sai theo ngôi." },
    pre_a1_this_that: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Đại từ chỉ định. Bạn hãy sinh ra các đại từ nhiễu không phù hợp về khoảng cách hoặc số lượng." },
    pre_a1_like_plural: { label: "Cấu trúc sở thích", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Danh từ sau từ Like. Hãy đưa ra các danh từ số ít (thiếu s) để làm đáp án nhiễu." },
    pre_a1_commands: { label: "Câu mệnh lệnh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là từ Don\\'t. Bạn hãy sinh ra các từ phủ định nhiễu sai ngữ pháp (như No, Not)." },
    pre_a1_adj_order: { label: "Trật tự Tính từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ. Hãy đưa ra các tính từ nhiễu có nghĩa trái ngược hoặc không hợp màu sắc/kích thước." },
    pre_a1_he_she: { label: "Giới tính Đại từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ. Bạn hãy sinh ra các đại từ nhiễu sai giới tính (như He cho nữ)." },
    pre_a1_have_has: { label: "Động từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Have/Has. Hãy đưa ra các động từ sở hữu nhiễu bị chia sai ngôi." },
    pre_a1_prepositions: { label: "Giới từ vị trí", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ. Bạn hãy sinh ra các giới từ vị trí nhiễu làm sai lệch tính chất vật lý của câu." },
    pre_a1_yesno_order: { label: "Câu hỏi Yes/No", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ To be ở đầu câu hỏi. Hãy đưa ra các to be chia sai hoặc từ để hỏi Wh- làm nhiễu." },
    pre_a1_can_cant: { label: "Khả năng (Can/Can't)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Can/Can\\'t. Bạn hãy đưa ra các đáp án nhiễu sai logic khả năng hoặc kèm theo chữ 'to'." },
    
    // Bẫy Tiếng Anh (A1)
    eng_a1_pres_3rd_person: { label: "Động từ ngôi thứ 3 số ít", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ ngôi thứ 3 số ít. Hãy sinh ra các động từ nhiễu bị thiếu 's/es' hoặc chia sai quy tắc." },
    eng_a1_pres_tobe_verb_clash: { label: "Lỗi thừa To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ thường. Bạn hãy sinh ra các đáp án nhiễu bị ghép thừa To Be vào trước động từ (vd: am like, is play)." },
    eng_a1_pres_auxiliary: { label: "Trợ động từ phủ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trợ động từ phủ định. Hãy đưa ra các đáp án nhiễu sử dụng sai 'don\\'t' và 'doesn\\'t' hoặc dùng 'isn\\'t'." },
    eng_a1_adv_frequency_pos: { label: "Vị trí trạng từ tần suất", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trạng từ tần suất. Bạn hãy sinh ra các trạng từ nhiễu khác, hoặc cụm từ làm sai lệch cấu trúc tần suất." },
    eng_a1_pres_cont_missing_be: { label: "Hiện tại tiếp diễn (Thiếu To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ V-ing của thì tiếp diễn. Hãy đưa ra các đáp án nhiễu không có động từ To Be đi kèm." },
    eng_a1_pres_cont_base_verb: { label: "Hiện tại tiếp diễn (Thiếu -ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ chính của thì tiếp diễn. Bạn hãy sinh ra các đáp án nhiễu ở dạng nguyên thể (không có -ing) để lừa người học." },
    eng_a1_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trạng từ thời gian. Hãy đưa ra các trạng từ nhiễu bị xung đột với thì của động từ trong câu." },
    eng_a1_past_tobe_agreement: { label: "Quá khứ To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại To Be trong quá khứ. Bạn hãy sinh ra các đáp án nhiễu chia sai số ít/số nhiều (vd: was thay vì were)." },
    eng_a1_past_tobe_verb_clash: { label: "Quá khứ đơn (Thừa To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ quá khứ (V-ed). Hãy đưa ra các đáp án nhiễu bị ghép thừa was/were vào trước V-ed." },
    eng_a1_past_missing_ed: { label: "Quá khứ đơn (Thiếu -ed)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ quá khứ. Bạn hãy sinh ra các động từ nhiễu ở dạng nguyên thể hiện tại (không có -ed) để đánh lừa." },
    eng_a1_modal_can_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ sau 'can'. Hãy đưa ra các động từ nhiễu bị gắn thêm chữ 'to' phía trước." },
    eng_a1_modal_can_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ sau 'can'. Bạn hãy sinh ra các động từ nhiễu bị thêm 's/es' sai quy tắc." },
    eng_a1_would_like: { label: "Cấu trúc Would like", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại cấu trúc Would like. Hãy đưa ra các đáp án nhiễu chỉ có chữ 'like' hoặc 'want' thiếu lịch sự." },
    eng_a1_possessive_adj: { label: "Tính từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ sở hữu. Bạn hãy sinh ra các đại từ nhân xưng nhiễu (như me, I, you) để đánh lừa người học." },
    eng_a1_demonstrative_clash: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ chỉ định. Hãy đưa ra các đại từ nhiễu sai số lượng (ví dụ This thay vì These)." },
    eng_a1_uncountable_plural: { label: "Danh từ không đếm được", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Danh từ không đếm được. Bạn hãy sinh ra các danh từ nhiễu bị gắn thêm 's/es' sai quy tắc." },
    eng_a1_prep_time: { label: "Giới từ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ thời gian. Hãy đưa ra các giới từ nhiễu sai quy tắc thời gian (ví dụ dùng in thay cho on)." },
    eng_a1_prep_place_vn: { label: "Giới từ nơi chốn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ nơi chốn. Bạn hãy sinh ra các giới từ nhiễu mang tính word-by-word từ tiếng Việt." },
    eng_a1_conjunction_logic: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Liên từ. Hãy đưa ra các liên từ nhiễu mang nghĩa trái ngược với logic của hai vế câu." },
    eng_a1_wh_question_match: { label: "Từ để hỏi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Từ để hỏi. Bạn hãy sinh ra các từ Wh- nhiễu không phù hợp với thông tin ở câu trả lời." },
    
    // Bẫy Tiếng Anh (A1+)
    eng_a1p_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ chính hoặc Trạng từ thời gian. Hãy sinh ra các đáp án nhiễu có thì mâu thuẫn với ngữ cảnh." },
    eng_a1p_past_ed: { label: "Động từ quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ quá khứ bất quy tắc. Hãy đưa ra các đáp án nhiễu bị gắn sai đuôi '-ed'." },
    eng_a1p_past_double: { label: "Quá khứ phủ định/nghi vấn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ chính trong câu phủ định/nghi vấn quá khứ. Hãy đưa ra các động từ nhiễu bị chia ở dạng quá khứ." },
    eng_a1p_past_be_vs_do: { label: "To be và Trợ động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại To be hoặc Trợ động từ quá khứ. Bạn hãy sinh ra các đáp án nhiễu nhầm lẫn giữa 'was/were' và 'did'." },
    eng_a1p_comp_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ so sánh. Hãy tạo các đáp án nhiễu bị gắn dư chữ 'more'." },
    eng_a1p_comp_irregular: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ so sánh bất quy tắc. Bạn hãy sinh ra các đáp án nhiễu bị thêm đuôi '-er'." },
    eng_a1p_comp_than: { label: "Giới từ so sánh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 'than'. Hãy đưa ra các từ nối nhiễu như 'that', 'then' để đánh lừa." },
    eng_a1p_quant_some_any: { label: "Some/Any", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Some/Any. Bạn hãy sinh ra các lượng từ nhiễu sai quy tắc phủ định/khẳng định." },
    eng_a1p_quant_much_many: { label: "Lượng từ (Much/Many)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Much/Many. Hãy đưa ra lượng từ nhiễu không khớp với tính chất của danh từ." },
    eng_a1p_quant_a_lot_of: { label: "Lượng từ (A lot of)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại giới từ 'of' trong 'a lot of'. Bạn hãy sinh ra các giới từ sai để làm nhiễu." },
    eng_a1p_conj_because_so: { label: "Liên từ (Because/So)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Liên từ. Hãy đưa ra các liên từ nhiễu khiến câu bị lặp từ (dùng cả because và so)." },
    eng_a1p_adv_very_verb: { label: "Trạng từ Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại trạng từ chỉ mức độ. Bạn hãy sinh ra chữ 'very' làm đáp án nhiễu để bẫy thói quen đặt trước động từ." },
    eng_a1p_adv_too_much: { label: "Trạng từ Too/Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 'very'. Hãy đưa ra chữ 'too' làm đáp án nhiễu để người học nhầm lẫn nghĩa tích cực." },
    eng_a1p_job_article: { label: "Mạo từ nghề nghiệp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Mạo từ nghề nghiệp. Bạn hãy sinh ra các đại từ hoặc để trống (rỗng) làm đáp án nhiễu." },
    eng_a1p_modal_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ chính đứng sau khuyết thiếu. Hãy đưa ra các động từ nhiễu có chữ 'to' đứng trước." },
    eng_a1p_modal_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ khuyết thiếu hoặc Động từ chính. Bạn hãy sinh ra các động từ nhiễu bị thêm đuôi 's/es'." },
    eng_a1p_emotion_ed_ing: { label: "Tính từ chỉ cảm xúc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ cảm xúc/bản chất. Hãy đưa ra các tính từ nhiễu dùng sai đuôi '-ed' và '-ing'." },
    eng_a1p_tag_question: { label: "Câu hỏi đuôi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại phần Đuôi câu hỏi. Bạn hãy sinh ra các phần đuôi nhiễu không đảo cực với mệnh đề chính." },
    eng_a1p_phrasal_prep: { label: "Cụm động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Giới từ trong cụm động từ. Hãy đưa ra các giới từ sai hoặc đại từ làm nhiễu." },
    eng_a1p_time_quarter: { label: "Thời gian (Past/To)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 'past' hoặc 'to' chỉ thời gian. Bạn hãy hoán đổi chúng thành đáp án nhiễu." },
    
    // Bẫy Tiếng Anh (A2)
    eng_a2_past_interrupt: { label: "Hành động cắt ngang", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại động từ chính. Bạn hãy sinh ra các đáp án nhiễu đảo ngược thì giữa quá khứ tiếp diễn và quá khứ đơn." },
    eng_a2_pres_perf_form: { label: "Hiện tại hoàn thành", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ V3/ed hoặc trợ động từ have/has. Hãy đưa ra các đáp án nhiễu chia sai dạng V2 hoặc thiếu trợ động từ." },
    eng_a2_pres_perf_ever: { label: "Vị trí Ever/Never", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ Ever hoặc Never. Bạn hãy sinh ra các trạng từ khác hoặc cấu trúc sai vị trí để làm nhiễu." },
    eng_a2_future_will_going: { label: "Thì tương lai", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại 'be going to' hoặc 'will'. Hãy đưa ra các đáp án nhiễu thiếu to-be hoặc dùng nhầm giữa kế hoạch và dự đoán." },
    eng_a2_although_but: { label: "Mặc dù... nhưng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 'Although'. Bạn hãy sinh ra các liên từ nhiễu như 'But' hoặc 'So' để lừa người học." },
    eng_a2_because_so: { label: "Bởi vì... cho nên", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại chữ 'Because'. Hãy đưa ra các liên từ nhiễu như 'So' hoặc 'Although' để bẫy người học." },
    eng_a2_if_type1_will: { label: "Câu điều kiện loại 1", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại động từ trong mệnh đề If. Bạn hãy sinh ra các đáp án nhiễu bị gắn thêm 'will' phía trước." },
    eng_a2_when_while_swap: { label: "When/While", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại 'When' hoặc 'While'. Hãy đưa ra các liên từ thời gian nhiễu bị đảo ngược cách dùng." },
    eng_a2_adv_of_manner: { label: "Trạng từ thể cách", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Trạng từ thể cách. Bạn hãy sinh ra các Tính từ nhiễu (không có đuôi -ly) để bẫy người học." },
    eng_a2_comparative_double: { label: "So sánh kép", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ so sánh hơn. Hãy đưa ra các đáp án nhiễu bị chèn dư chữ 'more' trước tính từ ngắn." },
    eng_a2_superlative_missing_the: { label: "So sánh nhất (Thiếu 'the')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại mạo từ 'the' của so sánh nhất. Bạn hãy sinh ra các mạo từ sai hoặc giới từ làm đáp án nhiễu." },
    eng_a2_irregular_adj: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ so sánh bất quy tắc. Hãy đưa ra các đáp án nhiễu bị chia sai theo công thức thêm -er/est." },
    eng_a2_modal_plus_to: { label: "Động từ khuyết thiếu (+to)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại động từ sau khuyết thiếu. Bạn hãy sinh ra các đáp án nhiễu bị gắn thêm giới từ 'to'." },
    eng_a2_modal_plus_ving: { label: "Động từ khuyết thiếu (+V-ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại động từ sau khuyết thiếu. Hãy đưa ra các đáp án nhiễu ở dạng V-ing thay vì nguyên thể." },
    eng_a2_have_to_conjugation: { label: "Cấu trúc Have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại 'have to' hoặc 'has to'. Bạn hãy sinh ra các đáp án nhiễu bị chia sai ngôi." },
    eng_a2_mustn_dont_have_to: { label: "Mustn't và Don't have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại 'mustn\\'t' hoặc 'don\\'t have to'. Hãy đưa ra các khuyết thiếu nhiễu bị tráo đổi ý nghĩa." },
    eng_a2_much_many: { label: "Much/Many", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Much/Many. Bạn hãy sinh ra lượng từ nhiễu không khớp với tính chất đếm được của danh từ." },
    eng_a2_few_little: { label: "A few/A little", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại A few/A little. Hãy đưa ra các lượng từ nhiễu hoán đổi cách dùng của danh từ đếm được và không đếm được." },
    eng_a2_make_do_swap: { label: "Collocation Make/Do", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại động từ 'make' hoặc 'do'. Bạn hãy sinh ra các đáp án nhiễu tráo đổi hai động từ này." },
    eng_a2_phrasal_prep: { label: "Cụm động từ (Phrasal Verbs)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại giới từ của Phrasal verb. Hãy đưa ra các giới từ nhiễu làm thay đổi sai lệch ý nghĩa của cụm động từ." },
    
    // Bẫy Tiếng Anh (General Legacy)
    eng_article_an: { label: "Mạo từ A/An", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Mạo từ A/An. Bạn hãy sinh ra các mạo từ hoặc từ chỉ lượng sai quy tắc để đánh lừa." },
    eng_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Danh từ. Hãy tạo các đáp án nhiễu là dạng số nhiều bị chia sai của danh từ bất quy tắc." },
    eng_present_cont: { label: "Hiện tại tiếp diễn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ To be hoặc Động từ V-ing. Bạn hãy sinh ra các trợ động từ sai thì hoặc sai ngôi để làm nhiễu." },
    eng_this_these: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Đại từ chỉ định. Hãy tạo ra các đại từ nhiễu sai về số lượng hoặc khoảng cách." },
    eng_past_irregular: { label: "Quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Động từ quá khứ V2. Bạn hãy sinh ra các động từ nhiễu bị gắn sai đuôi -ed." },
    eng_comparative_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Tính từ so sánh. Hãy tạo các đáp án nhiễu bị sai quy tắc so sánh (như dư chữ more)." },
    eng_much_many: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Lượng từ. Bạn hãy sinh ra các lượng từ nhiễu không phù hợp với tính chất đếm được của danh từ." },
    eng_since_for: { label: "Hiện tại hoàn thành (Since/For)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí đục lỗ là Giới từ Since/For. Hãy đưa ra các giới từ thời gian khác sai ngữ cảnh để làm nhiễu." },
    eng_passive_missing_be: { label: "Câu bị động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ To be trong câu bị động. Bạn hãy sinh ra các trợ động từ nhiễu sai thì hoặc cấu trúc." },
    eng_vietglish_collocation: { label: "Cụm từ cố định (Collocation)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đục lỗ tại Động từ trong Collocation. Hãy đưa ra các động từ nhiễu mang nghĩa word-by-word tiếng Việt." }
  },

  // ====================================================
  // GAME GHÉP CÂU (SCRAMBLE NOISE) - SINH TỪ RÁC (DISTRACTORS)
  // ====================================================
  scramble: {
    // Bẫy Tiếng Trung (HSK 1)
    zh_hsk1_pronoun_gender: { label: "Đại từ nhân xưng (Giới tính)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là đại từ sai giới tính (他/她) để lừa học viên ghép sai nhân vật." },
    zh_hsk1_pronoun_location: { label: "Đại từ chỉ thị (Vật/Nơi chốn)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là đại từ chỉ vật (这/那) để dụ học viên dùng sai thay cho nơi chốn." },
    zh_hsk1_question_quantity: { label: "Từ để hỏi số lượng (几/多少)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là 几 hoặc 多少 sai logic số lượng để bẫy người học." },
    zh_hsk1_number_liang: { label: "Số lượng từ (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là số đếm 二 để dụ người học ghép vào trước lượng từ." },
    zh_hsk1_measure_mismatch: { label: "Lượng từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là một lượng từ sai hoàn toàn với danh từ trong câu." },
    zh_hsk1_negation_bumei: { label: "Phủ định (不/没)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 不 (nếu câu dùng 没) hoặc ngược lại để lừa học viên." },
    zh_hsk1_modal_ability: { label: "Động từ năng nguyện (会/能)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là 会 hoặc 能 dùng sai tính chất khả năng để làm nhiễu." },
    zh_hsk1_verb_direction: { label: "Hướng di chuyển (去/来)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là 去 hoặc 来 ngược hướng với câu gốc." },
    zh_hsk1_adj_predicate_shi: { label: "Vị ngữ tính từ (Thừa 是)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 是 để dụ học viên ghép vào trước tính từ vị ngữ." },
    zh_hsk1_particle_de_redundant: { label: "Trợ từ 的", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 的 để dụ học viên tạo ra sở hữu kép sai ngữ pháp." },
    zh_hsk1_exclam_tai_le: { label: "Cấu trúc cảm thán 太...了", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 了 để bẫy học viên gắn vào dạng phủ định 不太." },
    zh_hsk1_question_ma_ne: { label: "Trợ từ nghi vấn (吗/呢)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 吗 để dụ học viên gắn vào câu đã có từ để hỏi." },
    zh_hsk1_serial_verb_order: { label: "Câu liên động", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là giới từ 在 để dụ học viên ghép sai cụm địa điểm." },
    zh_hsk1_time_order: { label: "Trạng ngữ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là trạng từ thời gian sai mốc để làm rối loạn trật tự câu." },
    zh_hsk1_place_order: { label: "Trạng ngữ địa điểm (在)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 从 hoặc 到 để bẫy học viên dùng sai giới từ 在." },
    
    // Bẫy Tiếng Trung (HSK 2)
    zh_hsk2_pronoun_ta_mismatch: { label: "Đại từ chỉ người/vật", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là đại từ 它/他/她 sai bản chất với đối tượng trong câu để bẫy người học." },
    zh_hsk2_pronoun_mei_measure: { label: "Đại từ 每", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 每 hoặc một danh từ để dụ học viên ghép trực tiếp mà bỏ quên lượng từ." },
    zh_hsk2_number_er_liang: { label: "Số lượng (二/两)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là số đếm 二 để dụ người học ghép vào trước lượng từ thay vì 两." },
    zh_hsk2_measure_mismatch: { label: "Lượng từ chuyên biệt", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là một lượng từ sai hoàn toàn với danh từ đặc trưng trong câu." },
    zh_hsk2_adv_you_zai: { label: "Phó từ lặp lại (又/再)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 又 (nếu câu dùng 再) hoặc ngược lại để lừa logic thời gian." },
    zh_hsk2_adv_jiu_pos: { label: "Phó từ 就", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là các phó từ khác để dụ học viên xếp sai vị trí chữ 就." },
    zh_hsk2_prep_gei_order: { label: "Giới từ 给", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là một động từ khác để dụ học viên dời cụm 给 ra phía sau." },
    zh_hsk2_conj_missing_pair: { label: "Câu ghép (Thiếu vế)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là liên từ sai cặp (ví dụ 但是) để bẫy học viên thay thế cho vế đúng." },
    zh_hsk2_conj_logic_clash: { label: "Logic liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là liên từ có logic đối lập với câu (như 虽然 cho câu nguyên nhân)." },
    zh_hsk2_state_comp_missing_verb: { label: "Bổ ngữ trạng thái (Thiếu động từ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 的 để dụ học viên dùng sai cấu trúc bổ ngữ trạng thái." },
    zh_hsk2_state_comp_obj_pos: { label: "Bổ ngữ trạng thái (Vị trí tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là tân ngữ dư thừa để dụ học viên xếp sai vị trí sau chữ 得." },
    zh_hsk2_compare_bi_adv: { label: "Câu so sánh 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 很 hoặc 非常 để dụ học viên nhét thừa vào trước tính từ so sánh." },
    zh_hsk2_prog_zhengzai_clash: { label: "Trạng thái tiếp diễn 正在", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 已经 để dụ học viên thay thế cho 正在 trong câu tiếp diễn." },
    zh_hsk2_approx_duo_less10: { label: "Ước lượng số nhỏ (<10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là các số đếm sai để dụ học viên xếp chữ 多 sai vị trí." },
    zh_hsk2_approx_duo_more10: { label: "Ước lượng số lớn (>=10)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 几 để làm nhiễu vị trí của chữ 多." },
    zh_hsk2_prep_cong_li: { label: "Giới từ khoảng cách (从/离)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 从 để bẫy học viên dùng sai thay cho 离." },
    zh_hsk2_aspect_zhe_le: { label: "Trợ từ động thái (着/了)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hãy sinh ra từ rác là chữ 了 để dụ học viên gắn sai vào câu đang duy trì trạng thái." },
    
    // Bẫy Tiếng Trung (HSK Legacy - Dành cho HSK 3/4)
    zh_hsk_separable_obj: { label: "Động từ Ly hợp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trọng điểm là Động từ ly hợp. Bạn hãy sinh ra những từ rác là Đại từ nhân xưng hoặc Danh từ để dụ dỗ người học ghép nó trực tiếp vào ngay sau động từ ly hợp." },
    zh_hsk_adv_zhongyu: { label: "Phó từ 终于", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mục tiêu là Phó từ 终于. Bạn hãy tạo từ rác là các trạng từ chỉ thời gian để đánh lừa người học dời 终于 ra sau động từ chính." },
    zh_hsk_adv_degree: { label: "Phó từ chỉ mức độ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Nhắm vào Phó từ mức độ. Hãy tạo từ rác như '很' hoặc '非常' để gây nhầm lẫn khi người học sắp xếp cấu trúc '越...越...' hoặc '极'." },
    zh_hsk_prep_mismatch: { label: "Giới từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ. Bạn hãy sinh ra từ rác là một giới từ sai ngữ cảnh (như '对') để lừa học viên thay thế cho giới từ đúng trong câu." },
    zh_hsk_conj_mismatch: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cặp liên từ 不但...而且. Hãy tạo từ rác là một liên từ sai cặp (như '还是') để thử thách khả năng ghi nhớ cặp hô ứng." },
    zh_hsk_noun_space: { label: "Danh từ không gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ không gian. Bạn hãy sinh ra từ rác là các chữ '里' hoặc '上' dư thừa để dụ người học ghép vào sau các danh từ đã mang nghĩa địa điểm." },
    zh_hsk_rc_negation: { label: "Phủ định Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Phủ định Bổ ngữ Kết quả. Bạn hãy sinh ra từ rác '不' để lừa học viên dùng sai từ phủ định cho quá khứ thay vì dùng '没'." },
    zh_hsk_rc_state: { label: "Bổ ngữ Kết quả", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ Kết quả. Hãy tạo từ rác là một Động từ/Tính từ biểu thị trạng thái kết quả trái ngược hẳn với logic ban đầu của câu." },
    zh_hsk_pc_ability: { label: "Bổ ngữ Khả năng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ Khả năng (得/不). Bạn hãy sinh ra từ rác là động từ năng nguyện '能' hoặc '不能' để đánh lừa cấu trúc." },
    zh_hsk_dc_location: { label: "Bổ ngữ Xu hướng (Vị trí)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ Xu hướng & Địa điểm. Bạn hãy tạo từ rác là giới từ '在' để thử thách người học đặt sai vị trí địa điểm." },
    zh_hsk_dc_direction: { label: "Bổ ngữ Xu hướng (Hướng)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bổ ngữ Xu hướng. Hãy sinh ra từ rác là động từ xu hướng (như 去, 来) ngược lại với hướng đi của câu gốc." },
    zh_hsk_ba_indefinite: { label: "Câu chữ 把 (Tân ngữ)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Bạn hãy sinh ra từ rác là các từ chỉ số lượng không xác định (như 一个) để dụ người học phá vỡ quy tắc tân ngữ xác định." },
    zh_hsk_ba_result: { label: "Câu chữ 把 (Kết quả)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu chữ 把. Hãy tạo từ rác là một động từ độc lập không kèm theo thành phần kết quả để thử thách người học." },
    zh_hsk_bei_reverse: { label: "Câu chữ 被", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu bị động chữ 被. Bạn hãy sinh ra từ rác là chữ '把' để thử xem học viên có nhầm lẫn giữa cấu trúc Chủ động và Bị động hay không." },
    zh_hsk_exist_order: { label: "Câu tồn tại với 着", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu Tồn tại (着). Hãy tạo từ rác là chữ '在' để dụ dỗ người học kéo Trạng ngữ Nơi chốn xuống cuối câu." },
    zh_hsk_emph_order: { label: "Cấu trúc nhấn mạnh 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 连...也/都. Bạn hãy sinh ra từ rác là chữ '就' hoặc '还' để làm rối loạn cặp hô ứng nhấn mạnh." },
    zh_hsk_emph_extreme: { label: "Cấu trúc 连...也/都", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 连...也/都. Hãy tạo từ rác là một danh từ chung chung, bình thường để lừa học viên đánh mất đi tính cực đoan của câu." },
    zh_hsk_paired_only_if: { label: "Cặp 只有...才...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 只有...才... Bạn hãy sinh ra từ rác là chữ '就' để người học dễ ghép sai cặp hô ứng điều kiện." },
    zh_hsk_paired_as_long_as: { label: "Cặp 只要...就...", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 只要...就... Bạn hãy sinh ra từ rác là chữ '才' để thử thách người học ghép sai cặp hô ứng." },
    zh_hsk_dist_li: { label: "Khoảng cách với 离", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc khoảng cách 离. Hãy tạo từ rác là chữ 从 hoặc 在 để đánh lừa người học ghép sai giới từ chỉ khoảng cách." },
    zh_hsk_comp_bi: { label: "Câu so sánh với 比", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu so sánh 比. Bạn hãy sinh ra từ rác là phó từ mức độ 很 hoặc 非常 để dụ học viên đặt vào trước tính từ so sánh." },
    zh_hsk_except_chule: { label: "Ngoại trừ 除了...以外", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc 除了...以外. Hãy tạo từ rác là liên từ 虽然 hoặc 但是 để thử thách sự nhạy bén về ngữ pháp của người học." },
    general_noise: { label: "Tạo nhiễu chung", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tạo nhiễu chung. Bạn hãy sinh ra các từ rác là Hư từ (的, 了, 是) hoặc Giới từ (在, 比) không phù hợp với văn cảnh để tăng độ khó logic." },
    
    // Bẫy Tiếng Anh (Pre-A1)
    pre_a1_article_an: { label: "Mạo từ (A/An)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ. Bạn hãy sinh ra từ rác là mạo từ sai (ví dụ 'a' thay vì 'an') để dụ người học ghép sai." },
    pre_a1_plural_s: { label: "Danh từ số nhiều", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Số nhiều. Hãy tạo từ rác là dạng không có 's' hoặc có 's' dư thừa của danh từ trong câu." },
    pre_a1_tobe_match: { label: "Động từ To be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: To be. Bạn hãy sinh ra từ rác là một to be chia sai ngôi để thử thách người học." },
    pre_a1_this_that: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Hãy tạo từ rác là đại từ chỉ sai khoảng cách (This thay vì That) để làm nhiễu." },
    pre_a1_like_plural: { label: "Cấu trúc sở thích", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Sở thích. Bạn hãy sinh ra từ rác là một danh từ số ít (không s) để lừa người học ghép sau chữ Like." },
    pre_a1_commands: { label: "Câu mệnh lệnh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mệnh lệnh. Hãy tạo từ rác là chữ 'No' hoặc 'Not' để dụ người học ghép sai cấu trúc phủ định." },
    pre_a1_adj_order: { label: "Trật tự Tính từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ. Bạn hãy sinh ra từ rác là các giới từ hoặc danh từ khác để làm xáo trộn trật tự tính từ." },
    pre_a1_he_she: { label: "Giới tính Đại từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới tính. Hãy tạo từ rác là đại từ 'He' hoặc 'She' sai giới tính so với nhân vật chính." },
    pre_a1_have_has: { label: "Động từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ sở hữu. Bạn hãy sinh ra từ rác là chữ 'have' hoặc 'has' chia sai ngôi." },
    pre_a1_prepositions: { label: "Giới từ vị trí", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ. Hãy tạo từ rác là các giới từ khác (như in/on/under/at) sai ngữ cảnh vật lý." },
    pre_a1_yesno_order: { label: "Câu hỏi Yes/No", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi. Bạn hãy sinh ra từ rác là trợ động từ Do/Does để làm nhiễu câu hỏi To be." },
    pre_a1_can_cant: { label: "Khả năng (Can/Can't)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Khả năng. Hãy tạo từ rác là chữ 'to' để dụ người học chèn vào sau chữ 'can'." },
    
    // Bẫy Tiếng Anh (A1)
    eng_a1_pres_3rd_person: { label: "Động từ ngôi thứ 3 số ít", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ ngôi thứ 3 số ít. Hãy sinh ra từ rác là dạng nguyên thể (không có s/es) của động từ chính trong câu." },
    eng_a1_pres_tobe_verb_clash: { label: "Lỗi thừa To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thừa To Be. Bạn hãy sinh ra từ rác là một động từ To Be (am/is/are) để dụ người học ghép thừa vào trước động từ thường." },
    eng_a1_pres_auxiliary: { label: "Trợ động từ phủ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trợ động từ phủ định. Hãy tạo từ rác là trợ động từ phủ định sai (don\\'t thay vì doesn\\'t) để đánh lừa." },
    eng_a1_adv_frequency_pos: { label: "Vị trí trạng từ tần suất", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ tần suất. Bạn hãy sinh ra các đại từ rác để làm rối loạn trật tự ghép câu có trạng từ tần suất." },
    eng_a1_pres_cont_missing_be: { label: "Hiện tại tiếp diễn (Thiếu To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Hãy tạo từ rác là các trợ động từ Do/Does để lừa người học thay thế cho To Be." },
    eng_a1_pres_cont_base_verb: { label: "Hiện tại tiếp diễn (Thiếu -ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại tiếp diễn. Bạn hãy sinh ra từ rác là động từ nguyên thể (không có -ing) của động từ chính." },
    eng_a1_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Hãy tạo từ rác là một trạng từ thời gian không khớp với thì của câu (vd: yesterday cho câu hiện tại)." },
    eng_a1_past_tobe_agreement: { label: "Quá khứ To Be", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ To Be. Bạn hãy sinh ra từ rác là was/were nhưng chia sai số ít/số nhiều so với chủ ngữ." },
    eng_a1_past_tobe_verb_clash: { label: "Quá khứ đơn (Thừa To Be)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Hãy tạo từ rác là was/were để lừa người học nhét thừa vào trước động từ V-ed." },
    eng_a1_past_missing_ed: { label: "Quá khứ đơn (Thiếu -ed)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ đơn. Bạn hãy sinh ra từ rác là dạng nguyên thể hiện tại (không có -ed) của động từ quá khứ." },
    eng_a1_modal_can_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy sinh ra từ rác là giới từ 'to' để dụ người học ghép ngay sau chữ 'can'." },
    eng_a1_modal_can_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy sinh ra từ rác là động từ có đuôi 's/es' để lừa người học ghép sau chữ 'can'." },
    eng_a1_would_like: { label: "Cấu trúc Would like", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Would like. Hãy tạo từ rác là các trợ động từ do/does để làm xáo trộn cụm would like." },
    eng_a1_possessive_adj: { label: "Tính từ sở hữu", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ sở hữu. Bạn hãy sinh ra từ rác là một đại từ nhân xưng (như I, you, she) để lừa người học dùng sai chức năng." },
    eng_a1_demonstrative_clash: { label: "Đại từ chỉ định", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Đại từ chỉ định. Hãy tạo từ rác là đại từ chỉ định sai số lượng (ví dụ This thay vì These) để đánh lừa." },
    eng_a1_uncountable_plural: { label: "Danh từ không đếm được", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Danh từ không đếm được. Bạn hãy sinh ra từ rác là dạng có đuôi 's' sai quy tắc của danh từ không đếm được." },
    eng_a1_prep_time: { label: "Giới từ thời gian", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ thời gian. Hãy tạo từ rác là các giới từ thời gian khác sai quy tắc (như in, on, at) để làm nhiễu." },
    eng_a1_prep_place_vn: { label: "Giới từ nơi chốn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ nơi chốn. Bạn hãy sinh ra từ rác là một giới từ mang tính dịch word-by-word từ tiếng Việt (ví dụ on)." },
    eng_a1_conjunction_logic: { label: "Liên từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Hãy tạo từ rác là một liên từ có ý nghĩa trái ngược với logic nối câu (như but thay vì because)." },
    eng_a1_wh_question_match: { label: "Từ để hỏi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Từ để hỏi. Bạn hãy sinh ra từ rác là một từ Wh- không liên quan đến thông tin ở câu trả lời." },
    
    // Bẫy Tiếng Anh (A1+)
    eng_a1p_tense_clash: { label: "Xung đột thì", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Xung đột thì. Bạn hãy sinh ra từ rác là một trạng từ thời gian không khớp với thì của câu (vd 'now' cho câu hiện tại đơn)." },
    eng_a1p_past_ed: { label: "Động từ quá khứ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ bất quy tắc. Hãy tạo từ rác là một động từ bị gắn sai đuôi '-ed' thay vì V2." },
    eng_a1p_past_double: { label: "Quá khứ phủ định/nghi vấn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Quá khứ phủ định/nghi vấn. Bạn hãy sinh ra từ rác là động từ chia ở thì quá khứ (V2/V-ed) để bẫy người học ghép sau 'didn\\'t'." },
    eng_a1p_past_be_vs_do: { label: "To be và Trợ động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: To be và Trợ động từ. Hãy tạo từ rác là 'was/were' hoặc 'did' sai bản chất câu để đánh lừa." },
    eng_a1p_comp_double: { label: "So sánh hơn", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh hơn. Bạn hãy sinh ra từ rác là chữ 'more' để dụ người học ghép dư vào cụm so sánh." },
    eng_a1p_comp_irregular: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy tạo từ rác là dạng thêm '-er' sai của tính từ (vd gooder)." },
    eng_a1p_comp_than: { label: "Giới từ so sánh", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Giới từ so sánh. Bạn hãy sinh ra từ rác là 'that' hoặc 'then' để bẫy người học dùng sai 'than'." },
    eng_a1p_quant_some_any: { label: "Some/Any", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Some/Any. Hãy tạo từ rác là 'some' hoặc 'any' dùng ngược với thể phủ định/khẳng định của câu." },
    eng_a1p_quant_much_many: { label: "Lượng từ (Much/Many)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ. Bạn hãy sinh ra từ rác là 'much' hoặc 'many' không khớp loại danh từ." },
    eng_a1p_quant_a_lot_of: { label: "Lượng từ (A lot of)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Lượng từ A lot of. Hãy tạo từ rác là các giới từ khác (như in, on) để làm nhiễu cụm 'a lot of'." },
    eng_a1p_conj_because_so: { label: "Liên từ (Because/So)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Liên từ. Bạn hãy sinh ra từ rác là 'so' (nếu câu có because) hoặc ngược lại để dụ người học dùng cả hai." },
    eng_a1p_adv_very_verb: { label: "Trạng từ Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Very. Hãy tạo từ rác là chữ 'very' để bẫy người học đặt trước động từ." },
    eng_a1p_adv_too_much: { label: "Trạng từ Too/Very", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ Too/Very. Bạn hãy sinh ra từ rác là chữ 'too' để lừa người học thay thế 'very' với ý nghĩa tích cực." },
    eng_a1p_job_article: { label: "Mạo từ nghề nghiệp", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mạo từ nghề nghiệp. Hãy tạo từ rác là mạo từ sai hoặc đại từ để gây xáo trộn." },
    eng_a1p_modal_to: { label: "Động từ khuyết thiếu (Thừa 'to')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy sinh ra từ rác là chữ 'to' để dụ người học nhét sau khuyết thiếu." },
    eng_a1p_modal_s: { label: "Động từ khuyết thiếu (Thừa 's')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo từ rác là động từ có đuôi 's' để bẫy người học ghép sau khuyết thiếu." },
    eng_a1p_emotion_ed_ing: { label: "Tính từ chỉ cảm xúc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ chỉ cảm xúc. Bạn hãy sinh ra từ rác là tính từ có đuôi '-ed' hoặc '-ing' bị nhầm lẫn tính chất." },
    eng_a1p_tag_question: { label: "Câu hỏi đuôi", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu hỏi đuôi. Hãy tạo từ rác là trợ động từ hoặc đại từ sai cực (phủ định/khẳng định) so với vế trước." },
    eng_a1p_phrasal_prep: { label: "Cụm động từ", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ. Bạn hãy sinh ra từ rác là các giới từ sai để làm hỏng cụm phrasal verb." },
    eng_a1p_time_quarter: { label: "Thời gian (Past/To)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thời gian. Hãy tạo từ rác là 'past' (nếu câu dùng to) hoặc ngược lại để gây nhầm lẫn." },
    
    // Bẫy Tiếng Anh (A2)
    eng_a2_past_interrupt: { label: "Hành động cắt ngang", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hành động cắt ngang. Bạn hãy sinh ra từ rác là các trợ động từ (was/were, did) sai thì để lừa người học." },
    eng_a2_pres_perf_form: { label: "Hiện tại hoàn thành", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Hiện tại hoàn thành. Hãy tạo từ rác là trợ động từ 'did' hoặc dạng V2 của động từ chính." },
    eng_a2_pres_perf_ever: { label: "Vị trí Ever/Never", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Vị trí Ever/Never. Bạn hãy sinh ra từ rác là các trạng từ thời gian quá khứ (như yesterday) để làm xáo trộn thì." },
    eng_a2_future_will_going: { label: "Thì tương lai", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Thì tương lai. Hãy tạo từ rác là 'will' (nếu câu dùng going to) hoặc ngược lại để dụ người học dùng sai thì." },
    eng_a2_although_but: { label: "Mặc dù... nhưng", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mặc dù... nhưng. Bạn hãy sinh ra từ rác là chữ 'but' để dụ người học ghép thừa vào mệnh đề thứ hai." },
    eng_a2_because_so: { label: "Bởi vì... cho nên", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Bởi vì... cho nên. Hãy tạo từ rác là chữ 'so' để bẫy người học ghép thừa vào mệnh đề thứ hai." },
    eng_a2_if_type1_will: { label: "Câu điều kiện loại 1", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Câu điều kiện. Bạn hãy sinh ra từ rác là chữ 'will' để dụ người học nhét thừa vào vế 'If'." },
    eng_a2_when_while_swap: { label: "When/While", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: When/While. Hãy tạo từ rác là 'when' (nếu câu dùng while) hoặc ngược lại để lừa người học." },
    eng_a2_adv_of_manner: { label: "Trạng từ thể cách", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Trạng từ thể cách. Bạn hãy sinh ra từ rác là một Tính từ (không có đuôi -ly) để bẫy người học ghép sau động từ thường." },
    eng_a2_comparative_double: { label: "So sánh kép", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh kép. Hãy tạo từ rác là chữ 'more' hoặc 'most' để dụ người học ghép dư vào cụm so sánh." },
    eng_a2_superlative_missing_the: { label: "So sánh nhất (Thiếu 'the')", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: So sánh nhất. Bạn hãy sinh ra từ rác là mạo từ 'a' hoặc 'an' để làm xáo trộn cụm so sánh nhất." },
    eng_a2_irregular_adj: { label: "Tính từ bất quy tắc", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Tính từ bất quy tắc. Hãy tạo từ rác là dạng thêm '-er' sai của tính từ bất quy tắc." },
    eng_a2_modal_plus_to: { label: "Động từ khuyết thiếu (+to)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Bạn hãy sinh ra từ rác là chữ 'to' để dụ người học nhét thừa sau động từ khuyết thiếu." },
    eng_a2_modal_plus_ving: { label: "Động từ khuyết thiếu (+V-ing)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Động từ khuyết thiếu. Hãy tạo từ rác là động từ có đuôi '-ing' để bẫy người học ghép sau modal verb." },
    eng_a2_have_to_conjugation: { label: "Cấu trúc Have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cấu trúc Have to. Bạn hãy sinh ra từ rác là 'have' hoặc 'has' sai ngôi để làm nhiễu." },
    eng_a2_mustn_dont_have_to: { label: "Mustn't và Don't have to", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Mustn\\'t và Don\\'t have to. Hãy tạo từ rác là trợ động từ phủ định không liên quan để đánh lừa." },
    eng_a2_much_many: { label: "Much/Many", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Much/Many. Bạn hãy sinh ra từ rác là 'much' hoặc 'many' không khớp loại danh từ trong câu." },
    eng_a2_few_little: { label: "A few/A little", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: A few/A little. Hãy tạo từ rác là 'few' hoặc 'little' đảo ngược cách dùng với danh từ." },
    eng_a2_make_do_swap: { label: "Collocation Make/Do", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Collocation Make/Do. Bạn hãy sinh ra từ rác là 'make' (nếu câu dùng do) hoặc ngược lại." },
    eng_a2_phrasal_prep: { label: "Cụm động từ (Phrasal Verbs)", prompt: "ĐỊNH HƯỚNG SÁNG TẠO: Cụm động từ (Phrasal Verbs). Hãy tạo từ rác là một giới từ sai (như on, at, in) để làm hỏng cụm phrasal verb." },
    
    // Bẫy Tiếng Anh (General Legacy)
    eng_article_an: { label: "Mạo từ A/An", prompt: "MỤC TIÊU: Mạo từ A/An. YÊU CẦU: Sinh ra TỪ RÁC là mạo từ sai (vd: 'a' nếu danh từ bắt đầu bằng nguyên âm) để lừa học viên ghép sai." },
    eng_plural_s: { label: "Danh từ số nhiều", prompt: "MỤC TIÊU: Danh từ số nhiều. YÊU CẦU: Sinh ra TỪ RÁC là dạng có '-s' hoặc '-es' bị chia sai của danh từ trong câu." },
    eng_present_cont: { label: "Hiện tại tiếp diễn", prompt: "MỤC TIÊU: Hiện tại tiếp diễn. YÊU CẦU: Sinh ra TỪ RÁC là động từ chia ở thì khác (vd: V-ed, V-s) hoặc sai to be (vd: 'are' nếu chủ ngữ là He)." },
    eng_this_these: { label: "Đại từ chỉ định", prompt: "MỤC TIÊU: Đại từ chỉ định. YÊU CẦU: Sinh ra TỪ RÁC là đại từ chỉ định sai số lượng (vd: chữ 'these' nếu danh từ là số ít)." },
    eng_past_irregular: { label: "Quá khứ bất quy tắc", prompt: "MỤC TIÊU: Quá khứ đơn. YÊU CẦU: Sinh ra TỪ RÁC là dạng động từ bị chia đuôi '-ed' sai quy tắc của động từ chính trong câu." },
    eng_comparative_double: { label: "So sánh hơn", prompt: "MỤC TIÊU: So sánh hơn. YÊU CẦU: Sinh ra TỪ RÁC là chữ 'more' hoặc 'most' dư thừa để lừa học viên xếp vào trước tính từ ngắn." },
    eng_much_many: { label: "Lượng từ (Much/Many)", prompt: "MỤC TIÊU: Much/Many. YÊU CẦU: Sinh ra TỪ RÁC là chữ 'much' (nếu danh từ đếm được) hoặc 'many' (nếu không đếm được)." },
    eng_since_for: { label: "Since/For", prompt: "MỤC TIÊU: Since/For. YÊU CẦU: Sinh ra TỪ RÁC là chữ 'for' (nếu câu dùng since) hoặc 'since' (nếu câu dùng for)." },
    eng_passive_missing_be: { label: "Câu bị động", prompt: "MỤC TIÊU: Bị động. YÊU CẦU: Sinh ra TỪ RÁC là các trợ động từ sai (vd: did, does, have) để lừa học viên thay thế cho to be." },
    eng_vietglish_collocation: { label: "Cụm từ cố định (Collocation)", prompt: "MỤC TIÊU: Collocation. YÊU CẦU: Sinh ra TỪ RÁC là một động từ mang nghĩa tiếng Việt tương đương nhưng sai tiếng Anh (vd: chữ 'make' thay vì 'do')." }
  }
};

// ==================================================================================
// 2. MA TRẬN TRỌNG SỐ (WEIGHT MATRIX LOGIC)
// ==================================================================================

export const getLevelWeight = (levelStr) => {
  if (!levelStr) return 99; // Nếu không có level, mặc định mở khóa tất cả
  const l = String(levelStr).toLowerCase();
  
  if (l.includes('level_1') || l.includes('kiddie') || l.includes('pre_a1')) return 1;
  if (l.includes('level_2') || l.includes('junior_basic') || l.includes('a1')) return 2;
  if (l.includes('level_3') || l.includes('junior_advanced') || l.includes('a1p')) return 3;
  if (l.includes('level_4') || l.includes('discovery_basic') || l.includes('a2')) return 4;
  if (l.includes('level_5') || l.includes('discovery_advanced') || l.includes('b1')) return 5;
  if (l.includes('level_6') || l.includes('pre_ielts') || l.includes('b2')) return 6;
  if (l.includes('level_7') || l.includes('breakthrough') || l.includes('c1')) return 7;
  if (l.includes('level_8') || l.includes('academic')) return 8;
  if (l.includes('level_9') || l.includes('expert') || l.includes('c2')) return 9;
  
  return 99;
};

export const getGrammarTopicWeight = (key) => {
  if (key.startsWith('general_')) return 0;
  if (key.startsWith('pre_a1') || key.startsWith('zh_hsk1')) return 1;
  if (key.startsWith('eng_a1_') || key.startsWith('zh_hsk2')) return 2;
  if (key.startsWith('eng_a1p_')) return 3;
  if (key.startsWith('eng_a2_')) return 4;
  if (key.startsWith('zh_hsk_')) return 3; // HSK Legacy (HSK 3/4) -> Đặt mốc 3 để từ HSK 3 trở lên mới dùng được
  return 99;
};

export const getGrammarGroup = (key) => {
  if (key.startsWith('zh_hsk1')) return 'HSK 1';
  if (key.startsWith('zh_hsk2')) return 'HSK 2';
  if (key.startsWith('zh_hsk')) return 'HSK 3/4';
  if (key.startsWith('pre_a1')) return 'Tiếng Anh Pre-A1 (Starters)';
  if (key.startsWith('eng_a1p')) return 'Tiếng Anh A1+ (Flyers)';
  if (key.startsWith('eng_a1')) return 'Tiếng Anh A1 (Movers)';
  if (key.startsWith('eng_a2')) return 'Tiếng Anh A2 (KET)';
  if (key.startsWith('eng_')) return 'Tiếng Anh (Chung)';
  return 'Chuyên đề Khác';
};

export const getGrammarTopics = (gameType, lang, currentLevel) => {
  const pool = MICRO_PROMPTS[gameType];
  if (!pool) return [];
  
  const isChinese = lang === 'zh';
  const isEnglish = lang === 'en';
  const userWeight = getLevelWeight(currentLevel);
  const topics = [];
  
  for (const key in pool) {
    const topicWeight = getGrammarTopicWeight(key);
    // Lưới lọc tuyệt đối: Loại bỏ các bẫy có trọng số lớn hơn trình độ người dùng
    if (topicWeight > userWeight) continue;
    
    if (isChinese && key.startsWith('zh_')) {
      topics.push({ id: key, label: pool[key].label, group: getGrammarGroup(key) });
    } else if (isEnglish && (key.startsWith('eng_') || key.startsWith('pre_'))) {
      topics.push({ id: key, label: pool[key].label, group: getGrammarGroup(key) });
    } else if (key.startsWith('general_')) {
      topics.push({ id: key, label: pool[key].label, group: "Lỗi Phổ Biến (General)" });
    }
  }
  return topics;
};