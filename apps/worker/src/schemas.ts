import { z } from "zod";

export const routerOutputSchema = z.object({
  candidate_articles: z.array(
    z.object({ article_id: z.number().min(1).max(25), confidence: z.number().min(0).max(1) })
  ),
  notes_ar: z.string().optional(),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

const locationSchema = z.object({
  start_offset: z.number(),
  end_offset: z.number(),
  start_line: z.number(),
  end_line: z.number(),
});

export const judgeFindingSchema = z.object({
  article_id: z.number().min(1).max(25),
  atom_id: z.string().optional().nullable(),
  title_ar: z.string(),
  description_ar: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  confidence: z.number().min(0).max(1),
  is_interpretive: z.boolean().optional().default(false),
  evidence_snippet: z.string(),
  location: locationSchema,
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
