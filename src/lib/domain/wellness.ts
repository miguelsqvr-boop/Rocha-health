// Wellness metrics people can record manually (wearable sync uses the same codes).

export const WELLNESS_METRICS = {
  sleep_hours: { label: "Sleep", unit: "h", domain: "sleep" },
  sleep_resting_hr: { label: "Resting heart rate (night)", unit: "bpm", domain: "sleep" },
  hrv: { label: "Heart rate variability", unit: "ms", domain: "sleep" },
  steps: { label: "Steps", unit: "steps", domain: "fitness" },
  active_minutes: { label: "Active minutes", unit: "min", domain: "fitness" },
  vo2max: { label: "VO₂ max", unit: "mL/kg/min", domain: "fitness" },
  resting_hr: { label: "Resting heart rate", unit: "bpm", domain: "vitals" },
  weight: { label: "Weight", unit: "kg", domain: "body_composition" },
  body_fat: { label: "Body fat", unit: "%", domain: "body_composition" },
  muscle_mass: { label: "Muscle mass", unit: "kg", domain: "body_composition" },
  waist: { label: "Waist", unit: "cm", domain: "body_composition" },
  systolic_bp: { label: "Blood pressure (systolic)", unit: "mmHg", domain: "vitals" },
  diastolic_bp: { label: "Blood pressure (diastolic)", unit: "mmHg", domain: "vitals" },
} as const;

export type WellnessMetric = keyof typeof WELLNESS_METRICS;

export const WELLNESS_DOMAINS = {
  sleep: { label: "Sleep", metrics: ["sleep_hours", "sleep_resting_hr", "hrv"] },
  fitness: { label: "Fitness", metrics: ["steps", "active_minutes", "vo2max", "resting_hr"] },
  body_composition: { label: "Body Composition", metrics: ["weight", "body_fat", "muscle_mass", "waist"] },
} as const satisfies Record<string, { label: string; metrics: WellnessMetric[] }>;

export type WellnessDomain = keyof typeof WELLNESS_DOMAINS;

export function metricLabel(metric: string): string {
  return metric in WELLNESS_METRICS ? WELLNESS_METRICS[metric as WellnessMetric].label : metric.replace(/_/g, " ");
}
