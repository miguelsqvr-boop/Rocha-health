-- Built-in reference data (family_id null). The Super Admin can add family
-- specific categories, biomarkers and preventive-care rules on top of these.

insert into public.health_categories (family_id, code, label, parent_code, sort_order) values
  (null, 'laboratory', 'Laboratory', null, 10),
  (null, 'imaging', 'Imaging', null, 20),
  (null, 'cardiology', 'Cardiology', null, 30),
  (null, 'consultations', 'Consultations', null, 40),
  (null, 'procedures', 'Procedures', null, 50),
  (null, 'prescriptions', 'Medications & Prescriptions', null, 60),
  (null, 'vaccinations', 'Vaccinations', null, 70),
  (null, 'dental', 'Dental', null, 80),
  (null, 'vision', 'Vision', null, 90),
  (null, 'sleep', 'Sleep', null, 100),
  (null, 'fitness', 'Fitness & Body Composition', null, 110),
  (null, 'other', 'Other', null, 999);

-- Reference ranges are adult defaults in the listed unit. Results keep the
-- range printed by the lab, which always takes precedence.
insert into public.biomarkers
  (family_id, code, name, category, default_unit, reference_low, reference_high, higher_is_better, loinc_code, synonyms, sort_order)
values
  -- Cardiovascular
  (null, 'total_cholesterol', 'Total cholesterol', 'cardiovascular', 'mg/dL', null, 200, false, '2093-3', '{"Cholesterol","Colesterol total","Colesterol"}', 10),
  (null, 'ldl_cholesterol', 'LDL cholesterol', 'cardiovascular', 'mg/dL', null, 130, false, '13457-7', '{"LDL","LDL-C","Colesterol LDL","Low density lipoprotein"}', 11),
  (null, 'hdl_cholesterol', 'HDL cholesterol', 'cardiovascular', 'mg/dL', 40, null, true, '2085-9', '{"HDL","HDL-C","Colesterol HDL","High density lipoprotein"}', 12),
  (null, 'non_hdl_cholesterol', 'Non-HDL cholesterol', 'cardiovascular', 'mg/dL', null, 160, false, '43396-1', '{"Non-HDL","Colesterol não-HDL"}', 13),
  (null, 'triglycerides', 'Triglycerides', 'cardiovascular', 'mg/dL', null, 150, false, '2571-8', '{"Triglicéridos","Triglicerídeos","TG"}', 14),
  (null, 'apob', 'Apolipoprotein B', 'cardiovascular', 'mg/dL', null, 130, false, '1884-6', '{"ApoB","Apo B","Apolipoproteína B"}', 15),
  (null, 'lipoprotein_a', 'Lipoprotein(a)', 'cardiovascular', 'mg/dL', null, 30, false, '10835-7', '{"Lp(a)","Lipoproteína (a)"}', 16),
  (null, 'homocysteine', 'Homocysteine', 'cardiovascular', 'µmol/L', 5, 15, null, '13965-9', '{"Homocisteína"}', 17),
  -- Metabolic
  (null, 'glucose_fasting', 'Fasting glucose', 'metabolic', 'mg/dL', 70, 99, null, '1558-6', '{"Glucose","Glicose","Glicémia","Glicemia em jejum","Fasting blood sugar"}', 20),
  (null, 'hba1c', 'HbA1c', 'metabolic', '%', 4.0, 5.6, false, '4548-4', '{"Hemoglobin A1c","Hemoglobina A1c","Hemoglobina glicada","Glycated haemoglobin","A1C"}', 21),
  (null, 'insulin_fasting', 'Fasting insulin', 'metabolic', 'µIU/mL', 2, 20, null, '20448-7', '{"Insulin","Insulina"}', 22),
  (null, 'uric_acid', 'Uric acid', 'metabolic', 'mg/dL', 3.5, 7.2, null, '3084-1', '{"Ácido úrico","Urate"}', 23),
  -- Kidney
  (null, 'creatinine', 'Creatinine', 'kidney', 'mg/dL', 0.6, 1.2, null, '2160-0', '{"Creatinina"}', 30),
  (null, 'egfr', 'eGFR', 'kidney', 'mL/min/1.73m²', 60, null, true, '33914-3', '{"Estimated GFR","TFG estimada","Taxa de filtração glomerular"}', 31),
  (null, 'urea', 'Urea', 'kidney', 'mg/dL', 15, 45, null, '3091-6', '{"Ureia","BUN","Blood urea nitrogen"}', 32),
  -- Liver
  (null, 'alt', 'ALT', 'liver', 'U/L', 7, 56, null, '1742-6', '{"ALT/TGP","TGP","SGPT","Alanine aminotransferase"}', 40),
  (null, 'ast', 'AST', 'liver', 'U/L', 10, 40, null, '1920-8', '{"AST/TGO","TGO","SGOT","Aspartate aminotransferase"}', 41),
  (null, 'ggt', 'GGT', 'liver', 'U/L', 8, 61, null, '2324-2', '{"Gama GT","Gamma-glutamyl transferase","γ-GT"}', 42),
  (null, 'alp', 'Alkaline phosphatase', 'liver', 'U/L', 44, 147, null, '6768-6', '{"ALP","Fosfatase alcalina"}', 43),
  (null, 'bilirubin_total', 'Total bilirubin', 'liver', 'mg/dL', 0.1, 1.2, null, '1975-2', '{"Bilirrubina total"}', 44),
  (null, 'albumin', 'Albumin', 'liver', 'g/dL', 3.5, 5.0, null, '1751-7', '{"Albumina"}', 45),
  -- Blood count
  (null, 'hemoglobin', 'Haemoglobin', 'blood_count', 'g/dL', 12.0, 17.5, null, '718-7', '{"Hemoglobin","Hemoglobina","Hb","HGB"}', 50),
  (null, 'hematocrit', 'Haematocrit', 'blood_count', '%', 36, 52, null, '4544-3', '{"Hematocrit","Hematócrito","HCT"}', 51),
  (null, 'rbc', 'Red blood cells', 'blood_count', '10^12/L', 4.2, 5.9, null, '789-8', '{"RBC","Eritrócitos","Glóbulos vermelhos","Erythrocytes"}', 52),
  (null, 'wbc', 'White blood cells', 'blood_count', '10^9/L', 4.0, 11.0, null, '6690-2', '{"WBC","Leucócitos","Glóbulos brancos","Leukocytes"}', 53),
  (null, 'platelets', 'Platelets', 'blood_count', '10^9/L', 150, 400, null, '777-3', '{"PLT","Plaquetas","Thrombocytes"}', 54),
  (null, 'mcv', 'MCV', 'blood_count', 'fL', 80, 100, null, '787-2', '{"Mean corpuscular volume","VGM","Volume globular médio"}', 55),
  -- Thyroid
  (null, 'tsh', 'TSH', 'thyroid', 'mIU/L', 0.4, 4.0, null, '3016-3', '{"Thyroid stimulating hormone","Tirotropina","TSH 3ª geração"}', 60),
  (null, 'free_t4', 'Free T4', 'thyroid', 'ng/dL', 0.8, 1.8, null, '3024-7', '{"FT4","T4 livre","Tiroxina livre"}', 61),
  (null, 'free_t3', 'Free T3', 'thyroid', 'pg/mL', 2.3, 4.2, null, '3051-0', '{"FT3","T3 livre"}', 62),
  -- Vitamins & minerals
  (null, 'vitamin_d', 'Vitamin D (25-OH)', 'vitamins_minerals', 'ng/mL', 30, 100, null, '1989-3', '{"25-OH vitamin D","Vitamina D","25-hidroxivitamina D","Vitamin D3"}', 70),
  (null, 'vitamin_b12', 'Vitamin B12', 'vitamins_minerals', 'pg/mL', 200, 900, null, '2132-9', '{"Vitamina B12","Cobalamin","Cianocobalamina"}', 71),
  (null, 'folate', 'Folate', 'vitamins_minerals', 'ng/mL', 3, null, true, '2284-8', '{"Folic acid","Ácido fólico","Folato"}', 72),
  (null, 'ferritin', 'Ferritin', 'vitamins_minerals', 'ng/mL', 30, 300, null, '2276-4', '{"Ferritina"}', 73),
  (null, 'iron', 'Iron', 'vitamins_minerals', 'µg/dL', 60, 170, null, '2498-4', '{"Ferro","Serum iron","Ferro sérico"}', 74),
  (null, 'magnesium', 'Magnesium', 'vitamins_minerals', 'mg/dL', 1.7, 2.2, null, '19123-9', '{"Magnésio","Mg"}', 75),
  (null, 'calcium', 'Calcium', 'vitamins_minerals', 'mg/dL', 8.5, 10.5, null, '17861-6', '{"Cálcio","Ca"}', 76),
  (null, 'sodium', 'Sodium', 'vitamins_minerals', 'mmol/L', 135, 145, null, '2951-2', '{"Sódio","Na"}', 77),
  (null, 'potassium', 'Potassium', 'vitamins_minerals', 'mmol/L', 3.5, 5.1, null, '2823-3', '{"Potássio","K"}', 78),
  -- Hormones
  (null, 'testosterone_total', 'Total testosterone', 'hormones', 'ng/dL', 300, 1000, null, '2986-8', '{"Testosterona total","Testosterone"}', 80),
  (null, 'cortisol_am', 'Cortisol (morning)', 'hormones', 'µg/dL', 6, 23, null, '2143-6', '{"Cortisol","Cortisol matinal"}', 81),
  (null, 'psa_total', 'PSA (total)', 'hormones', 'ng/mL', null, 4.0, false, '2857-1', '{"PSA","PSA total","Prostate specific antigen","Antigénio específico da próstata"}', 82),
  -- Inflammation
  (null, 'hs_crp', 'hs-CRP', 'inflammation', 'mg/L', null, 3.0, false, '30522-7', '{"CRP","C-reactive protein","PCR","Proteína C reativa","PCR alta sensibilidade"}', 90),
  (null, 'esr', 'ESR', 'inflammation', 'mm/h', 0, 20, false, '4537-7', '{"Erythrocyte sedimentation rate","VS","Velocidade de sedimentação"}', 91);

-- General screening guidance used to suggest upcoming preventive care. These
-- are defaults for the family to adapt with their doctors, not medical advice.
insert into public.preventive_care_rules
  (family_id, code, title, description, sex, min_age, max_age, interval_months, document_types, biomarker_codes, sort_order)
values
  (null, 'general_checkup', 'General check-up', 'Routine visit with a family doctor.', null, 18, null, 12, '{"consultation_note"}', '{}', 10),
  (null, 'paediatric_checkup', 'Paediatric check-up', 'Routine visit with a paediatrician.', null, 0, 17, 12, '{"consultation_note"}', '{}', 11),
  (null, 'routine_blood_test', 'Routine blood test', 'Blood count and basic chemistry.', null, 18, null, 12, '{"blood_test"}', '{}', 20),
  (null, 'lipid_panel', 'Cholesterol (lipid panel)', 'Total, LDL and HDL cholesterol and triglycerides.', null, 20, null, 60, '{}', '{"ldl_cholesterol","total_cholesterol"}', 21),
  (null, 'diabetes_screen', 'Blood sugar (HbA1c)', 'Screening for diabetes and prediabetes.', null, 35, null, 36, '{}', '{"hba1c","glucose_fasting"}', 22),
  (null, 'dental_checkup', 'Dental check-up', 'Check-up and cleaning.', null, 1, null, 6, '{"dental_record"}', '{}', 30),
  (null, 'eye_exam', 'Eye exam', 'Vision and eye health.', null, 3, null, 24, '{"eye_exam"}', '{}', 31),
  (null, 'flu_vaccine', 'Flu vaccine', 'Seasonal influenza vaccination.', null, 0, null, 12, '{"vaccination_record"}', '{}', 40),
  (null, 'colorectal_screening', 'Colorectal cancer screening', 'Colonoscopy or stool test, as advised.', null, 45, 75, 120, '{"endoscopy"}', '{}', 50),
  (null, 'cervical_screening', 'Cervical screening', 'Pap smear or HPV test.', 'female', 25, 65, 36, '{"pathology"}', '{}', 51),
  (null, 'breast_screening', 'Breast screening (mammogram)', 'Mammography.', 'female', 40, 74, 24, '{"mammogram"}', '{}', 52),
  (null, 'prostate_discussion', 'Prostate check (PSA)', 'Discuss PSA testing with a doctor.', 'male', 50, 70, 24, '{}', '{"psa_total"}', 53),
  (null, 'bone_density', 'Bone density (DEXA)', 'Osteoporosis screening.', 'female', 65, null, 24, '{"dexa_scan"}', '{}', 54);
