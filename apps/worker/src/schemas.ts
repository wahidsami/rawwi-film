import { z } from "zod";

function toNullableNumber(v: unknown): number | null | undefined {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export const routerOutputSchema = z.object({
  candidate_articles: z.array(
    z.object({ article_id: z.number().min(1).max(25), confidence: z.number().min(0).max(1) })
  ),
  notes_ar: z.string().optional(),
});

export type RouterOutput = z.infer<typeof routerOutputSchema>;

const locationSchema = z.object({
  // OpenAI occasionally emits null offsets/lines; accept null to avoid dropping valid findings.
  start_offset: z.preprocess(toNullableNumber, z.number().nullable()),
  end_offset: z.preprocess(toNullableNumber, z.number().nullable()),
  // OpenAI occasionally emits null for line numbers; accept null to avoid dropping valid findings.
  start_line: z.preprocess(toNullableNumber, z.number().nullable()),
  end_line: z.preprocess(toNullableNumber, z.number().nullable()),
});

const depictionTypeSchema = z.enum(["mention", "depiction", "endorsement", "condemnation", "unknown"]);
const speakerRoleSchema = z.enum(["narrator", "hero", "villain", "supporting", "unknown"]);
const narrativeConsequenceSchema = z.enum(["punished", "rewarded", "neutralized", "unresolved", "unknown"]);

export const judgeFindingSchema = z.object({
  article_id: z.preprocess(toNullableNumber, z.number().int().min(1).max(25)),
  atom_id: z.string().optional().nullable(),
  title_ar: z.string().optional().nullable().transform((v) => v ?? "مخالفة محتوى"),
  description_ar: z.string().optional().nullable().transform((v) => v ?? ""),
  // OpenAI may emit null; default to medium instead of dropping the whole finding.
  severity: z.enum(["low", "medium", "high", "critical"]).nullable().transform((v) => v ?? "medium"),
  // OpenAI may emit null; default to a conservative confidence instead of dropping.
  confidence: z.preprocess(toNullableNumber, z.number().min(0).max(1).nullable())
    .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0.7)),
  is_interpretive: z.boolean().nullable().optional().transform((v) => v ?? false),
  depiction_type: depictionTypeSchema.optional().nullable().transform((v) => v ?? "unknown"),
  speaker_role: speakerRoleSchema.optional().nullable().transform((v) => v ?? "unknown"),
  narrative_consequence: narrativeConsequenceSchema.optional().nullable().transform((v) => v ?? "unknown"),
  context_window_id: z.string().optional().nullable().transform((v) => v ?? null),
  context_confidence: z.preprocess(toNullableNumber, z.number().min(0).max(1).optional().nullable())
    .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : null)),
  lexical_confidence: z.preprocess(toNullableNumber, z.number().min(0).max(1).optional().nullable())
    .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : null)),
  policy_confidence: z.preprocess(toNullableNumber, z.number().min(0).max(1).optional().nullable())
    .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : null)),
  rationale_ar: z.string().optional().nullable().transform((v) => v ?? null),
  final_ruling: z.enum(["violation", "needs_review", "context_ok"]).optional().nullable().transform((v) => v ?? null),
  detection_pass: z.string().optional().nullable().transform((v) => v ?? null),
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
