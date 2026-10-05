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

export function buildBiomarkerIndex(definitions: BiomarkerDefinition[]) {
  const byCode = new Map<string, BiomarkerDefinition>();
  const byName = new Map<string, BiomarkerDefinition>();
  for (const def of definitions) {
    byCode.set(def.code, def);
    for (const name of [def.name, def.code.replace(/_/g, " "), ...def.synonyms]) {
      const k = key(name);
      if (k && !byName.has(k)) byName.set(k, def);
    }
  }
  return {
    /** Prefer the code the extractor proposed; fall back to the printed name. */
    match(analyteName: string, proposedCode?: string | null): BiomarkerDefinition | null {
      if (proposedCode && byCode.has(proposedCode)) return byCode.get(proposedCode)!;
      return byName.get(key(analyteName)) ?? null;
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
  if (definition && normalizeUnit(definition.default_unit) === normalizeUnit(result.unit)) {
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
