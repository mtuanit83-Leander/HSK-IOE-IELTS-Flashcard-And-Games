/**
* @file src/config/constants.js
* @description Chứa các hằng số hệ thống, key lưu trữ, danh sách mô hình AI và Ma trận định danh Bẫy sư phạm (Trap ID Registry).
* @origin Tầng 2 - Block 2.1a (Global Constants)
*/
export const STORAGE_KEYS = {
SETTINGS: 'fc_settings',
CARDS: 'fc_cards',
NOTEBOOK: 'fc_notebook',
MASTERED: 'fc_mastered',
API_KEY: 'fc_gemini_api_key',
DEFAULT_URL: 'fc_default_url',
EXPORT_URL: 'fc_export_url',
API_KEY_SHEET: 'fc_apikey_sheet_url',
INCORRECT_LIST: 'fc_incorrect_list',
LANG: 'fc_current_lang',
UI_LANG: 'fc_ui_lang',
ACTIVE_EXAM: 'fc_active_exam',
AI_MODEL: 'fc_ai_model',
QUOTA_TRACKER: 'fc_quota_tracker'
};
// Danh mục Mô hình AI và Cấu hình Hạn mức (RPD Limit)
export const AI_MODELS = [
{ id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite', rpdLimit: 500 },
{ id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', rpdLimit: 500 },
{ id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', rpdLimit: 20 },
{ id: 'gemini-3.0-flash', name: 'Gemini 3.0 Flash', rpdLimit: 20 },
{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash', rpdLimit: 20 },
{ id: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash', rpdLimit: 20 },
{ id: 'gemini-3.7-flash', name: 'Gemini 3.7 Flash', rpdLimit: 20 },
{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', rpdLimit: 20 }
];
// Nâng cấp cấu trúc Link mặc định thành Đa chiều (Từ vựng / Câu văn)
export const DEFAULT_SHEETS = {
en: {
vocab: "https://docs.google.com/spreadsheets/d/1k9blJ9jo-GHmqYEHQ_DEYlC5nVuZ-Zce2ZY4o7kU5kw/edit?usp=drive_link",
sentence: "https://docs.google.com/spreadsheets/d/1LwzLSR27rvCrc7d6_uCuIXiVfnDlfTCkRN4mgxz_STY/edit?usp=drive_link"
},
zh: {
vocab: "https://docs.google.com/spreadsheets/d/17lPYQ1mVWisPhHydugT6IEtl2bvcnmWmm367V_3dQHE/edit?usp=drive_link",
sentence: "https://docs.google.com/spreadsheets/d/1YMXhI2_aKdVDZp6hS5p4JqU3PJBDxI_JpVAUZdnDHiw/edit?usp=drive_link"
}
};
export const DEFAULT_API_KEY_SHEET = "https://docs.google.com/spreadsheets/d/1Pv3At-Qpz110ni2nxfSG9KN5j_wKFwHlH_6UORuCalY/edit?usp=drive_link";
// KHÔI PHỤC DI SẢN (Chỉ chứa định tuyến Key, tuyệt đối không chứa Thẻ mẫu)
export const CONFIG_SAMPLES = {
en: { dataKey: 'fc_data_en', noteKey: 'fc_notebook_en' },
zh: { dataKey: 'fc_data_zh', noteKey: 'fc_notebook_zh' }
};
// ============================================================================
// HỆ THỐNG MENU ĐỊNH DANH BẪY SƯ PHẠM (TRAP ID REGISTRY)
// ============================================================================
export const IoeEnumRegistry = {
// Bản đồ phân cấp: Level -> Danh sách bẫy được phép dùng
LEVEL_TO_TRAPS: {
// --- HỆ TIẾNG TRUNG (HSK) ---
zh_level_1: ['zh_hsk1_pronoun_gender', 'zh_hsk1_pronoun_location', 'zh_hsk1_question_quantity', 'zh_hsk1_number_liang', 'zh_hsk1_measure_mismatch', 'zh_hsk1_negation_bumei', 'zh_hsk1_modal_ability', 'zh_hsk1_verb_direction', 'zh_hsk1_adj_predicate_shi', 'zh_hsk1_particle_de_redundant', 'zh_hsk1_exclam_tai_le', 'zh_hsk1_question_ma_ne', 'zh_hsk1_serial_verb_order', 'zh_hsk1_time_order', 'zh_hsk1_place_order'],
zh_level_2: ['zh_hsk2_pronoun_ta_mismatch', 'zh_hsk2_pronoun_mei_measure', 'zh_hsk2_number_er_liang', 'zh_hsk2_measure_mismatch', 'zh_hsk2_adv_you_zai', 'zh_hsk2_adv_jiu_pos', 'zh_hsk2_prep_gei_order', 'zh_hsk2_conj_missing_pair', 'zh_hsk2_conj_logic_clash', 'zh_hsk2_state_comp_missing_verb', 'zh_hsk2_state_comp_obj_pos', 'zh_hsk2_compare_bi_adv', 'zh_hsk2_prog_zhengzai_clash', 'zh_hsk2_approx_duo_less10', 'zh_hsk2_approx_duo_more10', 'zh_hsk2_prep_cong_li', 'zh_hsk2_aspect_zhe_le'],
zh_level_3: ['zh_hsk_ba_indefinite', 'zh_hsk_ba_result', 'zh_hsk_bei_reverse', 'zh_hsk_exist_order', 'zh_hsk_pc_ability', 'zh_hsk_conj_mismatch', 'zh_hsk_except_chule'],
zh_level_4: ['zh_hsk_emph_order', 'zh_hsk_emph_extreme', 'zh_hsk_paired_only_if', 'zh_hsk_paired_as_long_as', 'zh_hsk_adv_zhongyu', 'zh_hsk_separable_obj', 'zh_hsk_adv_degree', 'zh_hsk_prep_mismatch', 'zh_hsk_noun_space', 'zh_hsk_rc_negation', 'zh_hsk_rc_state', 'zh_hsk_dc_direction', 'zh_hsk_dc_location', 'zh_hsk_dist_li', 'zh_hsk_comp_bi'],
// --- HỆ TIẾNG ANH (CEFR) ---
en_level_1: ['pre_a1_article_an', 'pre_a1_plural_s', 'pre_a1_tobe_match', 'pre_a1_this_that', 'pre_a1_like_plural', 'pre_a1_commands', 'pre_a1_adj_order', 'pre_a1_he_she', 'pre_a1_have_has', 'pre_a1_prepositions', 'pre_a1_yesno_order', 'pre_a1_can_cant'],
en_level_2: ['eng_a1_pres_3rd_person', 'eng_a1_pres_tobe_verb_clash', 'eng_a1_pres_auxiliary', 'eng_a1_adv_frequency_pos', 'eng_a1_pres_cont_missing_be', 'eng_a1_pres_cont_base_verb', 'eng_a1_tense_clash', 'eng_a1_past_tobe_agreement', 'eng_a1_past_tobe_verb_clash', 'eng_a1_past_missing_ed', 'eng_a1_modal_can_to', 'eng_a1_modal_can_s', 'eng_a1_would_like', 'eng_a1_possessive_adj', 'eng_a1_demonstrative_clash', 'eng_a1_uncountable_plural', 'eng_a1_prep_time', 'eng_a1_prep_place_vn', 'eng_a1_conjunction_logic', 'eng_a1_wh_question_match'],
en_level_3: ['eng_a1p_tense_clash', 'eng_a1p_past_ed', 'eng_a1p_past_double', 'eng_a1p_past_be_vs_do', 'eng_a1p_comp_double', 'eng_a1p_comp_irregular', 'eng_a1p_comp_than', 'eng_a1p_quant_some_any', 'eng_a1p_quant_much_many', 'eng_a1p_quant_a_lot_of', 'eng_a1p_conj_because_so', 'eng_a1p_adv_very_verb', 'eng_a1p_adv_too_much', 'eng_a1p_job_article', 'eng_a1p_modal_to', 'eng_a1p_modal_s', 'eng_a1p_emotion_ed_ing', 'eng_a1p_tag_question', 'eng_a1p_phrasal_prep', 'eng_a1p_time_quarter'],
en_level_4: ['eng_a2_past_interrupt', 'eng_a2_pres_perf_form', 'eng_a2_pres_perf_ever', 'eng_a2_future_will_going', 'eng_a2_although_but', 'eng_a2_because_so', 'eng_a2_if_type1_will', 'eng_a2_when_while_swap', 'eng_a2_adv_of_manner', 'eng_a2_comparative_double', 'eng_a2_superlative_missing_the', 'eng_a2_irregular_adj', 'eng_a2_modal_plus_to', 'eng_a2_modal_plus_ving', 'eng_a2_have_to_conjugation', 'eng_a2_mustn_dont_have_to', 'eng_a2_much_many', 'eng_a2_few_little', 'eng_a2_make_do_swap', 'eng_a2_phrasal_prep'],
en_level_5: ['eng_since_for', 'eng_passive_missing_be', 'eng_vietglish_collocation']
},
// Phương thức truy xuất nhanh
getAvailableTraps: function(levelKey) {
return this.LEVEL_TO_TRAPS[levelKey] || [];
}
};

