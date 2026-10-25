// Request bodies shared by the document confirm and details routes.

import { z } from "zod";
import { EXAM_TYPE_CODES, SPECIALTY_CODES } from "@/lib/domain/exams";

export const RequestedExamInput = z.object({
  exam_name: z.string().trim().min(1).max(200),
  exam_type: z.enum(EXAM_TYPE_CODES as [string, ...string[]]),
  body_site: z.string().trim().max(120).nullable(),
});

export const DoctorInput = {
  doctorName: z.string().trim().max(120).nullable().optional(),
  specialty: z.enum(SPECIALTY_CODES as [string, ...string[]]).nullable().optional(),
};
