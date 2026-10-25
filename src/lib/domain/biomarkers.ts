// Mapping printed lab analytes to biomarker definitions, flagging values
// against reference ranges, and deciding which results need human review.

import { normalizeText } from "./names";

export interface BiomarkerDefinition {
  id: string;
  code: string;
  name: string;
  category: string;
  default_unit: string | null;
  synonyms: string[];
  reference_low: number | null;
  reference_high: number | null;
  higher_is_better: boolean | null;
}

export type ResultFlag = "low" | "normal" | "high" | "abnormal";

// Specimen words labs add that do not change what is measured.
const NOISE = /\b(serum|soro|plasma|sangue|blood|serico|serica)\b/g;

function key(name: string): string {
  return normalizeText(name.replace(/\(.*?\)/g, " ")).replace(NOISE, " ").replace(/\s+/g, " ").trim();
}

/** What is known about a printed result when matching it to the catalogue. */
export interface ResultContext {
  unit: string | null;
  /** The value is a number (catalogue tests are all measured as numbers). */
  numeric: boolean;
  /** Sample type; the catalogue holds blood tests. Null when not stated. */
  specimen?: string | null;
}

/**
 * Whether a result can be this catalogue test: a number, from blood (or an
 * unstated specimen), and a percentage exactly when the test is measured as a
 * percentage. "Negativo" on a urine strip is not blood glucose, and the
 * albumin % of an electrophoresis is not blood albumin in g/dL.
 */
export function canBe(definition: BiomarkerDefinition, result: ResultContext): boolean {
  if (!result.numeric) return false;
  if (result.specimen && result.specimen !== "blood") return false;
  return isPercentUnit(definition.default_unit) === isPercentUnit(result.unit);
}

export function buildBiomarkerIndex(definitions: BiomarkerDefinition[]) {
  const byCode = new Map<string, BiomarkerDefinition>();
  // A printed name can stand for several tests (Neutrófilos: % and absolute).
  const byName = new Map<string, BiomarkerDefinition[]>();
  for (const def of definitions) {
    byCode.set(def.code, def);
    for (const name of [def.name, def.code.replace(/_/g, " "), ...def.synonyms]) {
      const k = key(name);
      if (!k) continue;
      const list = byName.get(k) ?? [];
      if (!list.includes(def)) list.push(def);
      byName.set(k, list);
    }
  }
  return {
    /**
     * Prefer the code the extractor proposed; fall back to the printed name.
     * With a result, only a test the result can be (see canBe) is returned.
     */
    match(analyteName: string, proposedCode?: string | null, result?: ResultContext): BiomarkerDefinition | null {
      const fits = (def: BiomarkerDefinition) => !result || canBe(def, result);
      const proposed = proposedCode ? byCode.get(proposedCode) : undefined;
      if (proposed && fits(proposed)) return proposed;
      return (byName.get(key(analyteName)) ?? []).find(fits) ?? null;
    },
    get(code: string) {
      return byCode.get(code) ?? null;
    },
  };
}

export function normalizeUnit(unit: string | null | undefined): string {
  return (unit ?? "")
    .toLowerCase()
    .replace(/μ/g, "µ")
    .replace(/\s+/g, "")
    .replace(/^mcg/, "µg");
}

// Units that labs spell differently but that give the same number.
const SAME_UNIT: Record<string, string> = {
  "10^3/µl": "10^9/l",
  "/nl": "10^9/l",
  "10^6/µl": "10^12/l",
  "/pl": "10^12/l",
  "µiu/ml": "miu/l",
  "iu/l": "u/l",
  mm: "mm/h",
  "mm/hora": "mm/h",
  "mm/1h": "mm/h",
  "mm/1ªhora": "mm/h",
  "mm/1ahora": "mm/h",
};

/**
 * One key per unit, so "x 10^3/µl" and "10^9/L", or "µUI/mL" and "mIU/L",
 * compare equal. Units on different scales (mg/dL and mmol/L) stay apart.
 */
export function unitKey(unit: string | null | undefined): string {
  const u = normalizeUnit(unit)
    .replace(/^[x×*]/, "")
    .replace(/³/g, "^3").replace(/⁶/g, "^6").replace(/⁹/g, "^9").replace(/¹²/g, "^12")
    .replace(/10e\^?(\d+)/g, "10^$1")
    .replace(/^u(?=(iu|ui|g|mol)\/)/, "µ")
    // Portuguese and French write UI for IU.
    .replace(/ui/g, "iu");
  return SAME_UNIT[u] ?? u;
}

export function isPercentUnit(unit: string | null | undefined): boolean {
  return unitKey(unit) === "%";
}

export function computeFlag(
  value: number | null,
  low: number | null | undefined,
  high: number | null | undefined,
): ResultFlag | null {
  if (value === null || Number.isNaN(value)) return null;
  if (low == null && high == null) return null;
  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "normal";
}

/** Reference range for a result: the lab's own, else the definition's when units agree. */
export function effectiveRange(
  result: { reference_low: number | null; reference_high: number | null; unit: string | null },
  definition: BiomarkerDefinition | null,
): { low: number | null; high: number | null } {
  if (result.reference_low != null || result.reference_high != null) {
    return { low: result.reference_low, high: result.reference_high };
  }
  if (definition && unitKey(definition.default_unit) === unitKey(result.unit)) {
    return { low: definition.reference_low, high: definition.reference_high };
  }
  return { low: null, high: null };
}

/** Parses numbers as labs print them: "5,6", "< 0.5", "1 234". */
export function parseNumeric(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.trim().replace(/^[<>≤≥]=?\s*/, "").replace(/\s/g, "");
  if (!/^-?\d+([.,]\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * High confidence only when everything lines up: a known biomarker, a clean
 * numeric value, a unit, and the extractor itself was confident.
 */
export function resultConfidence(input: {
  definition: BiomarkerDefinition | null;
  value: number | null;
  unit: string | null;
  extractorConfident: boolean;
}): "high" | "needs_review" {
  return input.definition && input.value !== null && input.unit && input.extractorConfident
    ? "high"
    : "needs_review";
}
