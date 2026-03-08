import { z } from "zod";

export const routerOutputSchema = z.object({
  candidate_articles: z.array(
    z.object({ article_id: z.number().min(1).max(25), confidence: z.number().min(0).max(1) })
  ),
  notes_ar: z.string().optional(),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

const locationSchema = z.object({
  // OpenAI occasionally emits null offsets/lines; accept null to avoid dropping valid findings.
  start_offset: z.number().nullable(),
  end_offset: z.number().nullable(),
  // OpenAI occasionally emits null for line numbers; accept null to avoid dropping valid findings.
  start_line: z.number().nullable(),
  end_line: z.number().nullable(),
});

export const judgeFindingSchema = z.object({
  article_id: z.number().min(1).max(25),
  atom_id: z.string().optional().nullable(),
  title_ar: z.string(),
  description_ar: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  is_interpretive: z.boolean().nullable().optional().transform((v) => v ?? false),
  evidence_snippet: z.string().nullable().transform((v) => v ?? ""),
  location: locationSchema
    .nullable()
    .transform((v) => v ?? { start_offset: 0, end_offset: 0, start_line: null, end_line: null }),
});

export const judgeOutputSchema = z.object({
  findings: z.array(judgeFindingSchema),
});

export type JudgeFinding = z.infer<typeof judgeFindingSchema>;
export type JudgeOutput = z.infer<typeof judgeOutputSchema>;

export function extractJsonFromText(raw: string): string {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return raw;
  return raw.slice(first, last + 1);
}

export function parseRouterOutput(raw: string): RouterOutput {
  const json = extractJsonFromText(raw);
  const parsed = JSON.parse(json) as unknown;
  return routerOutputSchema.parse(parsed);
}

export function parseJudgeOutput(raw: string): JudgeOutput {
  const json = extractJsonFromText(raw);
  const parsed = JSON.parse(json) as unknown;
  return judgeOutputSchema.parse(parsed);
}
