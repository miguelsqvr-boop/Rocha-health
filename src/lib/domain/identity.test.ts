import { describe, expect, it } from "vitest";
import { assessIdentity, compareNames, describeCheck, type IdentityCandidate } from "./identity";

const family: IdentityCandidate[] = [
  { id: "miguel", displayName: "Miguel", legalName: "Miguel Vieira da Rocha", aliases: [], dateOfBirth: "1980-05-14" },
  { id: "santi", displayName: "Santi", legalName: "Santiago Rocha", aliases: [], dateOfBirth: "2004-03-02" },
  { id: "gui", displayName: "Gui", legalName: "Guilherme Rocha", aliases: [], dateOfBirth: "2007-07-19" },
  { id: "ben", displayName: "Ben", legalName: "Benjamim Rocha", aliases: [], dateOfBirth: "2010-11-30" },
  { id: "alice", displayName: "Alice", legalName: "Alice Rocha", aliases: ["Alice Maria Rocha"], dateOfBirth: "2014-01-08" },
];

describe("compareNames", () => {
  it("matches the same person across formats", () => {
    expect(compareNames("Santiago Rocha", "Santiago Rocha")).toBe("full");
    expect(compareNames("ROCHA, SANTIAGO", "Santiago Rocha")).toBe("full");
    expect(compareNames("Sr. Miguel Rocha", "Miguel Vieira da Rocha")).toBe("full");
    expect(compareNames("Miguel Vieira da Rocha", "Miguel Vieira da Rocha")).toBe("full");
    expect(compareNames("JOSÉ ÁLVARES", "Jose Alvares")).toBe("full");
  });

  it("never treats a shared family surname as a match", () => {
    expect(compareNames("Santiago Rocha", "Miguel Vieira da Rocha")).toBe("none");
    expect(compareNames("Guilherme Rocha", "Benjamim Rocha")).toBe("none");
  });

  it("treats short forms and initials as partial", () => {
    expect(compareNames("Santi Rocha", "Santiago Rocha")).toBe("partial");
    expect(compareNames("M. Rocha", "Miguel Vieira da Rocha")).toBe("partial");
    expect(compareNames("Santiago", "Santiago Rocha")).toBe("partial");
    expect(compareNames("Santiago Rocha", "Santi")).toBe("partial");
  });

  it("rejects the same first name with a different surname", () => {
    expect(compareNames("Miguel Santos", "Miguel Vieira da Rocha")).toBe("none");
  });
});

describe("assessIdentity", () => {
  it("confirms the spec example: Santi selected, document for Santiago Rocha", () => {
    const result = assessIdentity({ patientName: "Santiago Rocha", dateOfBirth: "2004-03-02" }, family);
    expect(result.by_member.santi.status).toBe("match");
    expect(result.by_member.santi.name).toBe("full");
    expect(result.by_member.santi.dateOfBirth).toBe("match");
    expect(result.suggested_member_id).toBe("santi");
    expect(describeCheck(result.by_member.santi)).toEqual([
      { ok: true, text: "Patient name matches" },
      { ok: true, text: "Date of birth matches" },
    ]);
  });

  it("flags the mismatch when Miguel is selected for Santiago's document", () => {
    const result = assessIdentity({ patientName: "Santiago Rocha", dateOfBirth: null }, family);
    expect(result.by_member.miguel.status).toBe("mismatch");
    expect(result.suggested_member_id).toBe("santi");
  });

  it("treats a different date of birth as a mismatch even when the name matches", () => {
    const result = assessIdentity({ patientName: "Santiago Rocha", dateOfBirth: "2004-02-03" }, family);
    expect(result.by_member.santi.status).toBe("mismatch");
    expect(result.suggested_member_id).toBeNull();
  });

  it("is uncertain when the document has no patient details", () => {
    const result = assessIdentity({ patientName: null, dateOfBirth: null }, family);
    for (const check of Object.values(result.by_member)) expect(check.status).toBe("uncertain");
    expect(result.suggested_member_id).toBeNull();
  });

  it("is uncertain on a surname-only or initial-only name without a date of birth", () => {
    const result = assessIdentity({ patientName: "M. Rocha", dateOfBirth: null }, family);
    expect(result.by_member.miguel.status).toBe("uncertain");
    expect(result.suggested_member_id).toBeNull();
  });

  it("accepts a partial name when the date of birth confirms it", () => {
    const result = assessIdentity({ patientName: "Santi Rocha", dateOfBirth: "2004-03-02" }, family);
    expect(result.by_member.santi.status).toBe("match");
  });

  it("uses aliases recorded by the Super Admin", () => {
    const result = assessIdentity({ patientName: "Alice Maria Rocha", dateOfBirth: null }, family);
    expect(result.by_member.alice.status).toBe("match");
  });

  it("never suggests anyone when two profiles match equally", () => {
    const twins: IdentityCandidate[] = [
      { id: "a", displayName: "Ana", legalName: "Ana Rocha", aliases: [], dateOfBirth: null },
      { id: "b", displayName: "Ana", legalName: "Ana Rocha", aliases: [], dateOfBirth: null },
    ];
    const result = assessIdentity({ patientName: "Ana Rocha", dateOfBirth: null }, twins);
    expect(result.suggested_member_id).toBeNull();
    expect(result.by_member.a.status).toBe("uncertain");
    expect(result.by_member.b.status).toBe("uncertain");
  });
});
