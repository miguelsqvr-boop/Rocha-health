// Data completeness for the Family Overview: what is missing for each person,
// so the Super Admin knows what to collect next. Not a health score.

export interface CompletenessInput {
  hasLogin: boolean;
  hasDateOfBirth: boolean;
  latestBloodTest: string | null;
  latestWellness: string | null;
  medicationsRecorded: boolean;
  wearableConnected: boolean;
  today?: Date;
}

export interface CompletenessCheck {
  key: string;
  label: string;
  done: boolean;
}

function withinDays(iso: string | null, days: number, today: Date): boolean {
  if (!iso) return false;
  return today.getTime() - new Date(iso).getTime() <= days * 86_400_000;
}

export function completeness(input: CompletenessInput): { percent: number; checks: CompletenessCheck[] } {
  const today = input.today ?? new Date();
  const checks: CompletenessCheck[] = [
    { key: "profile", label: "date of birth", done: input.hasDateOfBirth },
    { key: "login", label: "own login", done: input.hasLogin },
    { key: "blood_test", label: "blood test (last 12 months)", done: withinDays(input.latestBloodTest, 365, today) },
    { key: "wellness", label: "wellness data (last 30 days)", done: withinDays(input.latestWellness, 30, today) },
    { key: "medications", label: "medications & supplements", done: input.medicationsRecorded },
    { key: "wearable", label: "connected wearable", done: input.wearableConnected },
  ];
  const percent = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);
  return { percent, checks };
}
