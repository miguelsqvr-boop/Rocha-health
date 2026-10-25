-- Lab results are linked to a catalogue test (biomarker_id) so that the same
-- test from different labs and reports lands on one chart.
--
-- 1. The white-cell differential joins the catalogue, in both forms labs print
--    it: a percentage and an absolute count. Each lab spells it differently
--    ("Neutrófilos", "Neutrófilos %", "Neutrófilos (absoluto)"), and many print
--    the reference range on only one of the two lines, so as separate tests
--    most of them had no range at all. No typical ranges here: they vary a lot
--    with age, and labs print their own.
-- 2. Results linked to a catalogue test they can't be are unlinked: a word
--    result ("Negativo" on a urine strip is not blood glucose), or a
--    percentage linked to a test measured in another unit (the albumin
--    fraction of a protein electrophoresis is not blood albumin).
-- 3. Existing differential results are linked to the new entries.
--
-- Only the link changes; every value, unit and range stays as the lab printed
-- it. The changes are written to the audit log, one entry per person.

insert into public.biomarkers
  (family_id, code, name, category, default_unit, reference_low, reference_high, higher_is_better, loinc_code, synonyms, sort_order)
values
  (null, 'neutrophils_pct', 'Neutrophils %', 'blood_count', '%', null, null, null, '770-8', '{"Neutrophils","Neutrófilos","Neutrófilos %","Neutrófilos segmentados","NEUT%"}', 56),
  (null, 'neutrophils_abs', 'Neutrophils (absolute)', 'blood_count', '10^9/L', null, null, null, '751-8', '{"Neutrophils","Neutrófilos","Neutrófilos (absoluto)","Neutrófilos segmentados","NEUT#","ANC"}', 57),
  (null, 'lymphocytes_pct', 'Lymphocytes %', 'blood_count', '%', null, null, null, '736-9', '{"Lymphocytes","Linfócitos","Linfócitos %","LYMPH%"}', 58),
  (null, 'lymphocytes_abs', 'Lymphocytes (absolute)', 'blood_count', '10^9/L', null, null, null, '731-0', '{"Lymphocytes","Linfócitos","Linfócitos (absoluto)","LYMPH#"}', 59),
  (null, 'monocytes_pct', 'Monocytes %', 'blood_count', '%', null, null, null, '5905-5', '{"Monocytes","Monócitos","Monócitos %","MONO%"}', 60),
  (null, 'monocytes_abs', 'Monocytes (absolute)', 'blood_count', '10^9/L', null, null, null, '742-7', '{"Monocytes","Monócitos","Monócitos (absoluto)","MONO#"}', 61),
  (null, 'eosinophils_pct', 'Eosinophils %', 'blood_count', '%', null, null, null, '713-8', '{"Eosinophils","Eosinófilos","Eosinófilos %","EOS%"}', 62),
  (null, 'eosinophils_abs', 'Eosinophils (absolute)', 'blood_count', '10^9/L', null, null, null, '711-2', '{"Eosinophils","Eosinófilos","Eosinófilos (absoluto)","EOS#"}', 63),
  (null, 'basophils_pct', 'Basophils %', 'blood_count', '%', null, null, null, '706-2', '{"Basophils","Basófilos","Basófilos %","BASO%"}', 64),
  (null, 'basophils_abs', 'Basophils (absolute)', 'blood_count', '10^9/L', null, null, null, '704-7', '{"Basophils","Basófilos","Basófilos (absoluto)","BASO#"}', 65);

do $$
declare
  v_member record;
  v_unlinked jsonb;
  v_linked jsonb;
begin
  -- One audit entry per person below, instead of one per row from the trigger.
  perform app.begin_audited_operation();

  for v_member in select id, family_id from public.family_members loop
    with wrong as (
      select r.id, r.analyte_name, r.unit, b.code
      from public.health_results r
      join public.biomarkers b on b.id = r.biomarker_id
      where r.member_id = v_member.id
        and (r.value_numeric is null
             or (coalesce(trim(r.unit), '') = '%') <> (coalesce(trim(b.default_unit), '') = '%'))
    ), changed as (
      update public.health_results r set biomarker_id = null
      from wrong where r.id = wrong.id
      returning wrong.*
    )
    select jsonb_agg(jsonb_build_object('id', id, 'analyte_name', analyte_name, 'unit', unit, 'was_linked_to', code)
                     order by analyte_name)
      into v_unlinked from changed;

    with differential as (
      select r.id, r.analyte_name, r.unit,
        (case
           when r.analyte_name ~* '^\s*(neutr[oó]filos|neutrophils)' then 'neutrophils'
           when r.analyte_name ~* '^\s*(linf[oó]citos|lymphocytes)' then 'lymphocytes'
           when r.analyte_name ~* '^\s*(mon[oó]citos|monocytes)' then 'monocytes'
           when r.analyte_name ~* '^\s*(eosin[oó]filos|eosinophils)' then 'eosinophils'
           when r.analyte_name ~* '^\s*(bas[oó]filos|basophils)' then 'basophils'
         end)
        || (case
              when trim(r.unit) = '%' then '_pct'
              when r.unit ~* '10\s*\^?\s*(3|9)|10[³⁹]|/\s*nl' then '_abs'
            end) as code
      from public.health_results r
      where r.member_id = v_member.id
        and r.biomarker_id is null
        and r.value_numeric is not null
        -- The cell name alone, optionally marked as % or absolute: not
        -- "Linfócitos atípicos" or other tests that start the same way.
        and r.analyte_name ~* '^\s*[a-zçóú]+\s*(%|#|\((absolutos?|abs\.?|%)\))?\s*$'
    ), changed as (
      update public.health_results r set biomarker_id = b.id
      from differential d
      join public.biomarkers b on b.code = d.code and b.family_id is null
      where r.id = d.id
      returning d.*
    )
    select jsonb_agg(jsonb_build_object('id', id, 'analyte_name', analyte_name, 'unit', unit, 'linked_to', code)
                     order by analyte_name)
      into v_linked from changed;

    if v_unlinked is not null then
      perform app.write_audit(v_member.family_id, 'health_result.update', v_member.id, 'health_result', null,
        format('Unlinked %s results from catalogue tests they are not (word results, or a percentage vs another unit)',
               jsonb_array_length(v_unlinked)),
        jsonb_build_object('results', v_unlinked), null, '{"via": "migration 20261025000300_lab_test_links"}');
    end if;
    if v_linked is not null then
      perform app.write_audit(v_member.family_id, 'health_result.update', v_member.id, 'health_result', null,
        format('Linked %s white-cell differential results to the catalogue', jsonb_array_length(v_linked)),
        null, jsonb_build_object('results', v_linked), '{"via": "migration 20261025000300_lab_test_links"}');
    end if;
  end loop;
end $$;
