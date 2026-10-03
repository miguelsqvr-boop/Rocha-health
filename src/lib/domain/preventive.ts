// Preventive care: which rules apply to a person, when each was last done,
// and when it is next due. Rules are general guidance the family adapts.

export interface PreventiveRule {
  code: string;
  title: string;
  description: string | null;
  sex: "female" | "male" | null;
  min_age: number | null;
  max_age: number | null;
  interval_months: number;
  document_types: string[];
  biomarker_codes: string[];
  active: boolean;
}

export interface PreventiveInput {
  member: { date_of_birth: string | null; sex: string | null };
  rules: PreventiveRule[];
  documents: { document_type: string | null; document_date: string | null }[];
  results: { biomarker_code: string | null; result_date: string }[];
  completions: { rule_code: string; completed_on: string }[];
  today?: Date;
}

export type PreventiveStatus = "overdue" | "due_soon" | "up_to_date" | "no_record";

export interface PreventiveItem {
  rule: PreventiveRule;
  lastDone: string | null;
  dueOn: string | null;
  status: PreventiveStatus;
}

export function ageOn(dateOfBirth: string, today: Date): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

function applies(rule: PreventiveRule, member: PreventiveInput["member"], today: Date): boolean {
  if (!rule.active) return false;
  if (rule.sex && member.sex !== rule.sex) return false;
  if (rule.min_age != null || rule.max_age != null) {
    if (!member.date_of_birth) return false;
    const age = ageOn(member.date_of_birth, today);
    if (rule.min_age != null && age < rule.min_age) return false;
    if (rule.max_age != null && age > rule.max_age) return false;
  }
  return true;
}

const DUE_SOON_DAYS = 60;

export function preventiveItems(input: PreventiveInput): PreventiveItem[] {
  const today = input.today ?? new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const soonIso = new Date(today.getTime() + DUE_SOON_DAYS * 86_400_000).toISOString().slice(0, 10);

  return input.rules
    .filter((rule) => applies(rule, input.member, today))
    .map((rule) => {
      const dates = [
        ...input.documents
          .filter((d) => d.document_type && rule.document_types.includes(d.document_type))
          .map((d) => d.document_date),
        ...input.results
          .filter((r) => r.biomarker_code && rule.biomarker_codes.includes(r.biomarker_code))
          .map((r) => r.result_date),
        ...input.completions.filter((c) => c.rule_code === rule.code).map((c) => c.completed_on),
      ].filter((d): d is string => Boolean(d) && d! <= todayIso);
      const lastDone = dates.sort().at(-1) ?? null;
      const dueOn = lastDone ? addMonths(lastDone, rule.interval_months) : null;
      let status: PreventiveStatus;
      if (!dueOn) status = "no_record";
      else if (dueOn < todayIso) status = "overdue";
      else if (dueOn <= soonIso) status = "due_soon";
      else status = "up_to_date";
      return { rule, lastDone, dueOn, status };
    })
    .sort((a, b) => order(a) - order(b) || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
}

function order(item: PreventiveItem): number {
  return { overdue: 0, due_soon: 1, no_record: 2, up_to_date: 3 }[item.status];
}
