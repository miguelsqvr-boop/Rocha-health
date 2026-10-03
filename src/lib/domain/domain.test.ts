import { describe, expect, it } from "vitest";
import { buildFilingPath, categoryForType } from "./taxonomy";
import { buildBiomarkerIndex, computeFlag, effectiveRange, parseNumeric, resultConfidence, type BiomarkerDefinition } from "./biomarkers";
import { fitnessStatus, labDomainStatus, sleepStatus, type ResultPoint } from "./health-summary";
import { addMonths, ageOn, preventiveItems, type PreventiveRule } from "./preventive";
import { completeness } from "./completeness";
import { accessSummary, canAccessMember } from "./permissions";
import { formatDate } from "@/lib/format";

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
});

const defs: BiomarkerDefinition[] = [
  { id: "1", code: "hba1c", name: "HbA1c", category: "metabolic", default_unit: "%", synonyms: ["Hemoglobina A1c", "Hemoglobina glicada"], reference_low: 4, reference_high: 5.6, higher_is_better: false },
  { id: "2", code: "vitamin_d", name: "Vitamin D (25-OH)", category: "vitamins_minerals", default_unit: "ng/mL", synonyms: ["Vitamina D"], reference_low: 30, reference_high: 100, higher_is_better: null },
  { id: "3", code: "glucose_fasting", name: "Fasting glucose", category: "metabolic", default_unit: "mg/dL", synonyms: ["Glicose"], reference_low: 70, reference_high: 99, higher_is_better: null },
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
