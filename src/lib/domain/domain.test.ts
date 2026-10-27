import { describe, expect, it } from "vitest";
import { buildFilingPath, categoryForType } from "./taxonomy";
import { buildBiomarkerIndex, computeFlag, effectiveRange, parseNumeric, resultConfidence, unitKey, type BiomarkerDefinition } from "./biomarkers";
import {
  fitnessStatus, labDomainStatus, needsAttention, resultKey, seriesReference, sleepStatus, trendGroups, type LabResultLike, type ResultPoint,
} from "./health-summary";
import {
  canReport, describeProgress, doctorKey, examStatusCounts, filterExamRequests, groupExamRequests, possibleResultPairs, type ExamRequestLike,
} from "./exams";
import { addMonths, ageOn, preventiveItems, type PreventiveRule } from "./preventive";
import { completeness } from "./completeness";
import { accessSummary, canAccessMember } from "./permissions";
import { formatDate } from "@/lib/format";
import { isFutureDate } from "@/lib/validation";

describe("filing", () => {
  it("files the spec example under Laboratory → Blood Tests → 2026 → September", () => {
    expect(buildFilingPath("blood_test", "2026-09-12")).toEqual([
      "Health Records", "Laboratory", "Blood Tests", "2026", "September",
    ]);
  });
  it("uses Super Admin category labels and handles missing dates", () => {
    expect(buildFilingPath("ecg", null, { cardiology: "Heart" })).toEqual(["Health Records", "Heart", "ECGs", "Undated"]);
    expect(categoryForType("not-a-type")).toBe("other");
  });
  it("files surgeries and procedures under Procedures", () => {
    expect(buildFilingPath("surgery", "2020-12-15")).toEqual(["Health Records", "Procedures", "Surgeries & Procedures", "2020", "December"]);
  });
});

const defs: BiomarkerDefinition[] = [
  { id: "1", code: "hba1c", name: "HbA1c", category: "metabolic", default_unit: "%", synonyms: ["Hemoglobina A1c", "Hemoglobina glicada"], reference_low: 4, reference_high: 5.6, higher_is_better: false },
  { id: "2", code: "vitamin_d", name: "Vitamin D (25-OH)", category: "vitamins_minerals", default_unit: "ng/mL", synonyms: ["Vitamina D"], reference_low: 30, reference_high: 100, higher_is_better: null },
  { id: "3", code: "glucose_fasting", name: "Fasting glucose", category: "metabolic", default_unit: "mg/dL", synonyms: ["Glicose"], reference_low: 70, reference_high: 99, higher_is_better: null },
  { id: "4", code: "albumin", name: "Albumin", category: "liver", default_unit: "g/dL", synonyms: ["Albumina"], reference_low: 3.5, reference_high: 5, higher_is_better: null },
  { id: "5", code: "neutrophils_pct", name: "Neutrophils %", category: "blood_count", default_unit: "%", synonyms: ["Neutrófilos", "Neutrófilos %"], reference_low: null, reference_high: null, higher_is_better: null },
  { id: "6", code: "neutrophils_abs", name: "Neutrophils (absolute)", category: "blood_count", default_unit: "10^9/L", synonyms: ["Neutrófilos", "Neutrófilos (absoluto)"], reference_low: null, reference_high: null, higher_is_better: null },
];

describe("biomarkers", () => {
  const index = buildBiomarkerIndex(defs);
  it("matches Portuguese lab names, accents and specimen words", () => {
    expect(index.match("HEMOGLOBINA GLICADA")?.code).toBe("hba1c");
    expect(index.match("Glicose (soro)")?.code).toBe("glucose_fasting");
    expect(index.match("Vitamina D")?.code).toBe("vitamin_d");
    expect(index.match("Unknown analyte")).toBeNull();
  });
  it("prefers the extractor's proposed code", () => {
    expect(index.match("Some odd label", "vitamin_d")?.code).toBe("vitamin_d");
  });
  it("links a result only to a test it can be", () => {
    const blood = (unit: string | null, numeric = true, specimen: string | null = null) => ({ unit, numeric, specimen });
    // Same printed name, told apart by unit.
    expect(index.match("Neutrófilos", null, blood("%"))?.code).toBe("neutrophils_pct");
    expect(index.match("Neutrófilos", null, blood("x 10^3/µl"))?.code).toBe("neutrophils_abs");
    expect(index.match("Neutrófilos (absoluto)", null, blood("x10^9/L"))?.code).toBe("neutrophils_abs");
    // Word results, urine and percentages of other tests are not catalogue tests.
    expect(index.match("Glicose", null, blood(null, false))).toBeNull();
    expect(index.match("Glicose", null, blood("mg/dL", true, "urine"))).toBeNull();
    expect(index.match("Albumina", null, blood("%"))).toBeNull();
    expect(index.match("Albumina", "albumin", blood("%"))).toBeNull();
    expect(index.match("Albumina", null, blood("g/dl"))?.code).toBe("albumin");
  });
  it("treats unit spellings that give the same number as one unit", () => {
    expect(unitKey("x 10^3/µl")).toBe(unitKey("10^9/L"));
    expect(unitKey("x10^6/µl")).toBe(unitKey("x10^12/L"));
    expect(unitKey("µUI/mL")).toBe(unitKey("mIU/L"));
    expect(unitKey("uUI/ml")).toBe(unitKey("mUI/l"));
    expect(unitKey("U/l")).toBe(unitKey("UI/L"));
    expect(unitKey("mm/hora")).toBe(unitKey("mm"));
    expect(unitKey("mg/dl")).toBe(unitKey("mg/dL"));
    expect(unitKey("mg/dL")).not.toBe(unitKey("mmol/L"));
    expect(unitKey("mg/L")).not.toBe(unitKey("mg/dL"));
  });
  it("parses numbers as labs print them", () => {
    expect(parseNumeric("5,6")).toBe(5.6);
    expect(parseNumeric("< 0.5")).toBe(0.5);
    expect(parseNumeric("positivo")).toBeNull();
  });
  it("flags against the lab range, falling back to defaults only for the same unit", () => {
    expect(computeFlag(6.1, 4, 5.6)).toBe("high");
    expect(computeFlag(25, 30, null)).toBe("low");
    expect(effectiveRange({ reference_low: null, reference_high: null, unit: "mg/dL" }, defs[2])).toEqual({ low: 70, high: 99 });
    expect(effectiveRange({ reference_low: null, reference_high: null, unit: "mmol/L" }, defs[2])).toEqual({ low: null, high: null });
  });
  it("only marks clean, recognised results as high confidence", () => {
    expect(resultConfidence({ definition: defs[0], value: 5.4, unit: "%", extractorConfident: true })).toBe("high");
    expect(resultConfidence({ definition: null, value: 5.4, unit: "%", extractorConfident: true })).toBe("needs_review");
    expect(resultConfidence({ definition: defs[0], value: 5.4, unit: null, extractorConfident: true })).toBe("needs_review");
  });
});

const point = (code: string, date: string, value: number, low: number | null, high: number | null): ResultPoint => ({
  biomarker_code: code, analyte_name: code, category: "metabolic", result_date: date, value, low, high,
});

describe("domain status", () => {
  it("reports no data as —", () => expect(labDomainStatus([])).toBe("—"));
  it("reports a single in-range test as In range", () => {
    expect(labDomainStatus([point("hba1c", "2026-09-12", 5.3, 4, 5.6)])).toBe("In range");
  });
  it("detects improvement toward the range", () => {
    expect(labDomainStatus([point("hba1c", "2026-03-01", 6.2, 4, 5.6), point("hba1c", "2026-09-12", 5.8, 4, 5.6)])).toBe("Improving");
  });
  it("flags worsening", () => {
    expect(labDomainStatus([point("hba1c", "2026-03-01", 5.4, 4, 5.6), point("hba1c", "2026-09-12", 6.0, 4, 5.6)])).toBe("Needs attention");
  });
  it("reports unchanged in-range values as Stable", () => {
    expect(labDomainStatus([point("hba1c", "2026-03-01", 5.4, 4, 5.6), point("hba1c", "2026-09-12", 5.3, 4, 5.6)])).toBe("Stable");
  });
  it("summarises sleep and fitness from recent wellness data", () => {
    const today = new Date("2026-10-03T12:00:00Z");
    const day = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString();
    expect(sleepStatus([{ metric: "sleep_hours", value: 7.5, recorded_at: day(1) }], today)).toBe("Good");
    expect(sleepStatus([], today)).toBe("—");
    const steps = [
      ...[1, 3, 5].map((n) => ({ metric: "steps", value: 11000, recorded_at: day(n) })),
      ...[16, 18, 20].map((n) => ({ metric: "steps", value: 8000, recorded_at: day(n) })),
    ];
    expect(fitnessStatus(steps, today)).toBe("Improving");
  });
});

describe("preventive care", () => {
  const rules: PreventiveRule[] = [
    { code: "routine_blood_test", title: "Routine blood test", description: null, sex: null, min_age: 18, max_age: null, interval_months: 12, document_types: ["blood_test"], biomarker_codes: [], active: true },
    { code: "breast_screening", title: "Mammogram", description: null, sex: "female", min_age: 40, max_age: 74, interval_months: 24, document_types: ["mammogram"], biomarker_codes: [], active: true },
    { code: "diabetes_screen", title: "HbA1c", description: null, sex: null, min_age: 35, max_age: null, interval_months: 36, document_types: [], biomarker_codes: ["hba1c"], active: true },
  ];
  const today = new Date("2026-10-03T00:00:00Z");

  it("computes ages and month arithmetic correctly", () => {
    expect(ageOn("1980-10-04", today)).toBe(45);
    expect(ageOn("1980-10-03", today)).toBe(46);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("applies rules by age and sex, and dates them from documents and results", () => {
    const items = preventiveItems({
      member: { date_of_birth: "1980-05-14", sex: "male" },
      rules,
      documents: [{ document_type: "blood_test", document_date: "2025-09-01" }],
      results: [{ biomarker_code: "hba1c", result_date: "2026-09-12" }],
      completions: [],
      today,
    });
    expect(items.map((i) => i.rule.code)).toEqual(["routine_blood_test", "diabetes_screen"]);
    expect(items[0]).toMatchObject({ status: "overdue", lastDone: "2025-09-01", dueOn: "2026-09-01" });
    expect(items[1]).toMatchObject({ status: "up_to_date", dueOn: "2029-09-12" });
  });

  it("skips age-based rules when the date of birth is unknown", () => {
    expect(preventiveItems({ member: { date_of_birth: null, sex: null }, rules, documents: [], results: [], completions: [], today })).toEqual([]);
  });
});

describe("completeness and permissions", () => {
  it("lists what is missing", () => {
    const result = completeness({
      hasLogin: true, hasDateOfBirth: true, latestBloodTest: "2026-09-12", latestWellness: null,
      medicationsRecorded: false, wearableConnected: false, today: new Date("2026-10-03"),
    });
    expect(result.percent).toBe(50);
    expect(result.checks.filter((c) => !c.done).map((c) => c.key)).toEqual(["wellness", "medications", "wearable"]);
  });

  it("mirrors the database rules for the two initial roles", () => {
    const admin = { memberId: "m", familyId: "f", role: "super_admin" as const, status: "active" as const };
    const santi = { memberId: "s", familyId: "f", role: "member" as const, status: "active" as const };
    expect(canAccessMember(admin, { id: "s", family_id: "f" }, "read")).toBe(true);
    expect(canAccessMember(admin, { id: "x", family_id: "other" }, "read")).toBe(false);
    expect(canAccessMember(santi, { id: "s", family_id: "f" }, "write")).toBe(true);
    expect(canAccessMember(santi, { id: "m", family_id: "f" }, "read")).toBe(false);
    expect(canAccessMember({ ...santi, status: "deactivated" }, { id: "s", family_id: "f" }, "read")).toBe(false);
    expect(accessSummary("member", "active")).toEqual({ ownData: "Full", familyData: "None", admin: false });
    expect(accessSummary("super_admin", "active")).toEqual({ ownData: "Full", familyData: "Full", admin: true });
  });
});

describe("formatting", () => {
  it("formats dates as in the spec, independent of locale data", () => {
    expect(formatDate("2026-09-12")).toBe("12 Sep 2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("trends by category", () => {
  const bm = (code: string, name: string, category: string) => ({ code, name, category });
  const row = (date: string, value: number | null, unit: string | null, biomarker: LabResultLike["biomarker"], analyte = biomarker?.name ?? "") =>
    ({ result_date: date, value_numeric: value, unit, biomarker, analyte_name: analyte });
  const ldl = bm("ldl_cholesterol", "LDL cholesterol", "cardiovascular");
  const hba1c = bm("hba1c", "HbA1c", "metabolic");
  const tg = bm("triglycerides", "Triglycerides", "cardiovascular");

  it("groups tests by category in a fixed order, unknown tests last, names sorted", () => {
    const groups = trendGroups([
      row("2026-09-01", 5.4, "%", hba1c),
      row("2026-09-01", 120, "mg/dL", tg),
      row("2026-09-01", 98, "mg/dL", ldl),
      row("2026-09-01", 1.2, "U/mL", null, "Anti-TPO"),
    ]);
    expect(groups.map((g) => g.code)).toEqual(["cardiovascular", "metabolic", "other"]);
    expect(groups[0].series.map((s) => s.name)).toEqual(["LDL cholesterol", "Triglycerides"]);
    expect(groups[2].series[0]).toMatchObject({ key: "anti-tpo|u/ml", name: "Anti-TPO" });
  });

  it("keeps every numeric result for a test, newest first, and merges printed names regardless of case", () => {
    const [other] = trendGroups([
      row("2026-09-01", 3, "U/mL", null, "Anti-TPO"),
      row("2025-03-01", 2, "U/mL", null, "anti-tpo "),
      row("2024-01-01", null, "U/mL", null, "Anti-TPO"),
    ]);
    expect(other.series).toHaveLength(1);
    expect(other.series[0].rows.map((r) => r.result_date)).toEqual(["2026-09-01", "2025-03-01"]);
  });

  it("charts each unit of a test separately, merging spellings of the same unit", () => {
    const glucose = bm("glucose_fasting", "Fasting glucose", "metabolic");
    const [metabolic] = trendGroups([
      row("2026-09-01", 92, "mg/dL", glucose),
      row("2024-09-01", 5.1, "mmol/L", glucose),
      row("2023-09-01", 95, "mg/dl", glucose),
    ]);
    expect(metabolic.series.map((s) => [s.unit, s.rows.map((r) => r.value_numeric)])).toEqual([
      ["mg/dL", [92, 95]],
      ["mmol/L", [5.1]],
    ]);
    const [other] = trendGroups([row("2025-01-21", 2.7, "x 10^3/µl", null, "Platelets"), row("2021-02-09", 2.9, "x10^9/L", null, "platelets")]);
    expect(other.series).toHaveLength(1);
    expect(resultKey({ analyte_name: "Basófilos", unit: "%", biomarker: null })).not.toBe(resultKey({ analyte_name: "Basófilos", unit: "x10^3/µl", biomarker: null }));
  });

  it("returns nothing to chart when there are no numeric results", () => {
    expect(trendGroups([row("2026-09-01", null, null, ldl)])).toEqual([]);
  });
});

describe("reference ranges", () => {
  const r = (date: string, low: number | null, high: number | null, text: string | null = null, unit = "10^9/L") =>
    ({ result_date: date, unit, reference_low: low, reference_high: high, reference_text: text });
  const catalogue = { default_unit: "10^9/L", reference_low: 1.5, reference_high: 7.5 };

  it("uses the lab's range printed with the latest result", () => {
    expect(seriesReference([r("2025-01-21", 1.5, 8), r("2021-02-09", 2, 7)], catalogue, { adult: true })).toMatchObject({ low: 1.5, high: 8, source: "lab" });
  });
  it("falls back to the range printed on an earlier report of the same test", () => {
    expect(seriesReference([r("2025-01-21", null, null), r("2021-02-09", 1.5, 8)], catalogue, { adult: true }))
      .toMatchObject({ low: 1.5, high: 8, source: "earlier", fromDate: "2021-02-09" });
  });
  it("uses the catalogue's typical range only for adults and in its own unit", () => {
    expect(seriesReference([r("2025-01-21", null, null)], catalogue, { adult: true })).toMatchObject({ low: 1.5, high: 7.5, source: "typical" });
    expect(seriesReference([r("2025-01-21", null, null)], catalogue, { adult: false }).source).toBeNull();
    expect(seriesReference([r("2025-01-21", null, null, null, "/µl")], catalogue, { adult: true }).source).toBeNull();
  });
  it("keeps a range printed only as text", () => {
    expect(seriesReference([r("2025-01-21", null, null, "Risco elevado: >160; Risco baixo: <115")], null, { adult: true }))
      .toEqual({ low: null, high: null, source: null, fromDate: null, text: "Risco elevado: >160; Risco baixo: <115" });
  });
});

describe("results that need attention", () => {
  const res = (id: string, name: string, date: string, value: number | null, low: number | null, high: number | null, flag: string | null, text: string | null = null) => ({
    id, analyte_name: name, unit: "mg/dL", value_numeric: value, value_text: text, biomarker: null,
    result_date: date, reference_low: low, reference_high: high, reference_text: null, flag,
  });
  it("lists each test's latest result outside its range, furthest out first", () => {
    const items = needsAttention([
      res("1", "TSH", "2026-10-01", 9, 0.4, 4, "high"),
      res("2", "Ferritin", "2026-10-01", 20, 30, 300, "low"),
      res("3", "LDL", "2026-10-01", 120, null, 130, "normal"),
      res("4", "LDL", "2025-01-01", 160, null, 130, "high"),
      res("5", "Chlamydia PCR", "2026-09-01", null, null, null, "abnormal", "Positivo"),
      res("6", "Glucose", "2026-10-01", 30, 70, 99, null),
    ]);
    expect(items.map((i) => [i.result.id, i.level, i.direction])).toEqual([
      ["1", "far", "high"],
      ["6", "far", "low"],
      ["5", "abnormal", null],
      ["2", "outside", "low"],
    ]);
  });
});

describe("exam requests", () => {
  const exam = (exam_type: string) => ({ exam_name: exam_type, exam_type, body_site: null });
  const req = (id: string, date: string | null, doctor: string | null, specialty: string | null, types: string[], member = "m1"): ExamRequestLike =>
    ({ id, member_id: member, document_date: date, doctor_name: doctor, specialty, requested_exams: types.map(exam) });
  const requests = [
    req("a", "2026-10-02", "Dra. Ana Costa", "cardiology", ["echocardiogram", "blood_test"]),
    req("b", "2025-03-10", "ana costa", "cardiology", ["holter"]),
    req("c", "2026-01-15", null, null, ["ultrasound"], "m2"),
    req("d", null, "Rui Lopes", "general_practice", []),
  ];
  it("treats spellings of a doctor's name as one doctor", () => {
    expect(doctorKey("Dra. Ana  Costa")).toBe(doctorKey("ana costa"));
  });
  it("groups by year, newest first, undated last", () => {
    expect(groupExamRequests(requests, "date").map((s) => [s.label, s.requests.map((r) => r.id)]))
      .toEqual([["2026", ["a", "c"]], ["2025", ["b"]], ["Undated", ["d"]]]);
  });
  it("groups by doctor and specialty, not stated last", () => {
    expect(groupExamRequests(requests, "doctor").map((s) => [s.label, s.requests.map((r) => r.id)]))
      .toEqual([["Dra. Ana Costa", ["a", "b"]], ["Rui Lopes", ["d"]], ["Doctor not stated", ["c"]]]);
    expect(groupExamRequests(requests, "specialty").map((s) => s.label))
      .toEqual(["Cardiology", "General practice / family medicine", "Specialty not stated"]);
  });
  it("lists a request under every type of exam it asks for", () => {
    expect(groupExamRequests(requests, "type").map((s) => [s.key, s.requests.map((r) => r.id)])).toEqual([
      ["blood_test", ["a"]], ["ultrasound", ["c"]], ["echocardiogram", ["a"]], ["holter", ["b"]], ["other", ["d"]],
    ]);
  });
  it("describes and counts progress, and filters by it", () => {
    const base = { event_date: null, event_time: null, place: null, notes: null };
    expect(describeProgress({ ...base, status: "to_do" })).toBe("Not done yet");
    expect(describeProgress({ ...base, status: "done", event_date: "2026-11-12", place: "Hospital da Luz" })).toBe("Done · 12 Nov 2026 · Hospital da Luz");
    expect(describeProgress({ ...base, status: "scheduled", event_date: "2026-11-14", event_time: "10:30:00", place: "CUF" })).toBe("Booked · 14 Nov 2026, 10:30 · CUF");
    expect(describeProgress({ ...base, status: "done" })).toBe("Done");
    const withStatus = [
      { ...req("x", "2026-10-02", null, null, []), requested_exams: [{ exam_name: "A", exam_type: "mri", body_site: null, status: "done" }, { exam_name: "B", exam_type: "ecg", body_site: null, status: "to_do" }] },
      { ...req("y", "2026-10-03", null, null, []), requested_exams: [{ exam_name: "C", exam_type: "mri", body_site: null, status: "scheduled" }] },
    ];
    expect(examStatusCounts(withStatus.flatMap((r) => r.requested_exams))).toEqual({ to_do: 1, scheduled: 1, done: 1 });
    expect(filterExamRequests(withStatus, { status: "to_do" }).map((r) => r.id)).toEqual(["x"]);
    expect(filterExamRequests(withStatus, { status: "scheduled" }).map((r) => r.id)).toEqual(["y"]);
  });
  it("knows which documents can report which exams", () => {
    expect(canReport("ultrasound", "ultrasound")).toBe(true);
    expect(canReport("blood_test", "urine_test")).toBe(true);
    expect(canReport("ct_scan", "ultrasound")).toBe(false);
    expect(canReport("exam_request", "other")).toBe(false);
    expect(canReport(null, "blood_test")).toBe(false);
  });
  it("pairs open exams with documents of a fitting type and date", () => {
    const exams = [
      { id: "us", exam_type: "ultrasound", requested_on: "2025-12-16" },
      { id: "ct", exam_type: "ct_scan", requested_on: "2026-09-09" },
    ];
    const docs = [
      { id: "us-before", document_type: "ultrasound", document_date: "2025-11-01" },
      { id: "us-ok", document_type: "ultrasound", document_date: "2026-01-20" },
      { id: "us-week-before", document_type: "ultrasound", document_date: "2025-12-12" },
      { id: "ct-ok", document_type: "ct_scan", document_date: "2026-10-01" },
      { id: "us-late", document_type: "ultrasound", document_date: "2028-06-01" },
      { id: "blood", document_type: "blood_test", document_date: "2026-01-20" },
    ];
    expect(possibleResultPairs(exams, docs)).toEqual([
      { examId: "us", documentId: "us-ok" },
      { examId: "us", documentId: "us-week-before" },
      { examId: "ct", documentId: "ct-ok" },
    ]);
  });
  it("filters by person, specialty, doctor and exam type", () => {
    expect(filterExamRequests(requests, { doctor: doctorKey("Ana Costa") }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterExamRequests(requests, { specialty: "none" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterExamRequests(requests, { type: "ultrasound", member: "m2" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterExamRequests(requests, { type: "ultrasound", member: "m1" })).toEqual([]);
  });
});

describe("document dates", () => {
  const now = new Date("2026-10-25T23:30:00Z"); // already 26 Oct in some time zones
  it("accepts past dates and today, wherever the uploader is", () => {
    expect(isFutureDate("2024-08-30", now)).toBe(false);
    expect(isFutureDate("2026-10-25", now)).toBe(false);
    expect(isFutureDate("2026-10-26", now)).toBe(false);
  });
  it("rejects dates after tomorrow", () => {
    expect(isFutureDate("2026-10-28", now)).toBe(true);
    expect(isFutureDate("2027-01-01", now)).toBe(true);
  });
});
