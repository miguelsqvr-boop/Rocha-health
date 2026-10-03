// Wrong-person protection: compares the patient printed on a document with
// family member profiles. The result is stored on the document and the
// database refuses to file it under anyone whose status is not "match"
// unless a person explicitly confirms (see confirm_document()).
//
// Family members share surnames, so a surname alone never counts as a match:
// the first name (or an accepted short form of it) has to agree.

import { NAME_PARTICLES, nameTokens } from "./names";

export type IdentityStatus = "match" | "mismatch" | "uncertain";
export type NameAgreement = "full" | "partial" | "none" | "unknown";
export type DobAgreement = "match" | "mismatch" | "unknown";

export interface IdentityCandidate {
  id: string;
  displayName: string;
  legalName: string | null;
  aliases: string[];
  dateOfBirth: string | null;
}

export interface ExtractedIdentity {
  patientName: string | null;
  dateOfBirth: string | null;
}

export interface MemberIdentityCheck {
  status: IdentityStatus;
  name: NameAgreement;
  dateOfBirth: DobAgreement;
  /** The profile name the document was compared against. */
  comparedName: string;
}

export interface IdentityAssessment {
  extracted: ExtractedIdentity;
  /** Set only when exactly one member is a confident match. */
  suggested_member_id: string | null;
  by_member: Record<string, MemberIdentityCheck>;
}

function firstNamesAgree(a: string, b: string): "exact" | "short" | "initial" | null {
  if (a === b) return "exact";
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (shorter.length === 1 && longer.startsWith(shorter)) return "initial";
  // "Santi" / "Santiago", "Gui" / "Guilherme", "Ben" / "Benjamim".
  if (shorter.length >= 3 && longer.startsWith(shorter)) return "short";
  return null;
}

function significant(tokens: string[]): string[] {
  return tokens.filter((t) => !NAME_PARTICLES.has(t));
}

/** How well a printed name agrees with one profile name. */
export function compareNames(printed: string, profileName: string): NameAgreement {
  const doc = significant(nameTokens(printed));
  const profile = significant(nameTokens(profileName));
  if (doc.length === 0 || profile.length === 0) return "unknown";

  const first = firstNamesAgree(doc[0], profile[0]);
  if (!first) return "none";

  const docSurnames = doc.slice(1);
  const profileRest = new Set(profile.slice(1));
  const sharedSurnames = docSurnames.filter((t) => profileRest.has(t)).length;
  const conflictingSurnames = docSurnames.length - sharedSurnames;

  // Nothing to compare surnames against (e.g. profile is just "Santi").
  if (docSurnames.length === 0 || profileRest.size === 0) return "partial";
  if (first === "exact" && conflictingSurnames === 0) return "full";
  if (sharedSurnames > 0) return "partial";
  // Same first name but entirely different surnames: a different person.
  return "none";
}

function rankName(a: NameAgreement): number {
  return { full: 3, partial: 2, unknown: 1, none: 0 }[a];
}

export function compareDates(printed: string | null, profile: string | null): DobAgreement {
  if (!printed || !profile) return "unknown";
  return printed === profile ? "match" : "mismatch";
}

function checkMember(extracted: ExtractedIdentity, candidate: IdentityCandidate): MemberIdentityCheck {
  const profileNames = [candidate.legalName, candidate.displayName, ...candidate.aliases].filter(
    (n): n is string => Boolean(n && n.trim()),
  );
  let name: NameAgreement = "unknown";
  let comparedName = candidate.legalName ?? candidate.displayName;
  if (extracted.patientName) {
    name = "none";
    for (const profileName of profileNames) {
      const agreement = compareNames(extracted.patientName, profileName);
      if (rankName(agreement) > rankName(name)) {
        name = agreement;
        comparedName = profileName;
      }
    }
  }
  const dateOfBirth = compareDates(extracted.dateOfBirth, candidate.dateOfBirth);

  let status: IdentityStatus;
  if (dateOfBirth === "mismatch" || name === "none") status = "mismatch";
  else if (name === "full" || (name === "partial" && dateOfBirth === "match")) status = "match";
  else status = "uncertain";

  return { status, name, dateOfBirth, comparedName };
}

/**
 * Assess a document against every member the uploader may file for. A
 * "match" that is not unique (e.g. twins, or a printed name that fits two
 * profiles) is downgraded to "uncertain" so a person has to decide.
 */
export function assessIdentity(
  extracted: ExtractedIdentity,
  candidates: IdentityCandidate[],
): IdentityAssessment {
  const byMember: Record<string, MemberIdentityCheck> = {};
  for (const candidate of candidates) {
    byMember[candidate.id] = checkMember(extracted, candidate);
  }
  const matches = Object.entries(byMember).filter(([, c]) => c.status === "match");
  if (matches.length > 1) {
    for (const [, check] of matches) check.status = "uncertain";
  }
  return {
    extracted,
    suggested_member_id: matches.length === 1 ? matches[0][0] : null,
    by_member: byMember,
  };
}

/** Plain-language lines for the review screen. */
export function describeCheck(check: MemberIdentityCheck | undefined): { ok: boolean; text: string }[] {
  if (!check) return [{ ok: false, text: "This document was not checked against this person" }];
  const lines: { ok: boolean; text: string }[] = [];
  if (check.name === "full") lines.push({ ok: true, text: "Patient name matches" });
  else if (check.name === "partial") lines.push({ ok: false, text: "Patient name only partly matches" });
  else if (check.name === "none") lines.push({ ok: false, text: "Patient name is different" });
  else lines.push({ ok: false, text: "No patient name found on the document" });
  if (check.dateOfBirth === "match") lines.push({ ok: true, text: "Date of birth matches" });
  else if (check.dateOfBirth === "mismatch") lines.push({ ok: false, text: "Date of birth is different" });
  else lines.push({ ok: false, text: "Date of birth could not be compared" });
  return lines;
}
