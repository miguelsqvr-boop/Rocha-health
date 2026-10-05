// Name normalisation shared by identity and biomarker matching.

const HONORIFICS = new Set([
  "sr", "sra", "dr", "dra", "mr", "mrs", "ms", "miss", "mx", "exmo", "exma", "eng", "prof",
]);

/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** "ROCHA, Santiago" -> "Santiago ROCHA" (lab reports often print surname first). */
function reorderSurnameFirst(name: string): string {
  const parts = name.split(",");
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return `${parts[1].trim()} ${parts[0].trim()}`;
  }
  return name;
}

export function nameTokens(name: string): string[] {
  return normalizeText(reorderSurnameFirst(name))
    .split(" ")
    .filter((token) => token && !HONORIFICS.has(token));
}

/** Portuguese/Spanish/Dutch/German particles that carry no identity. */
export const NAME_PARTICLES = new Set(["da", "de", "do", "das", "dos", "e", "y", "van", "von", "der", "del", "la"]);
