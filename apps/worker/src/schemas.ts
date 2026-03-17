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

const factor1to4 = z.preprocess(
  (v) => (v != null ? Math.max(1, Math.min(4, Number(v) || 1)) : undefined),
  z.number().int().min(1).max(4).optional().nullable()
);

export const judgeFindingSchema = z.object({
  article_id: z.preprocess(toNullableNumber, z.number().int().min(1).max(25).optional().nullable()).transform((v) => (typeof v === "number" ? v : 0)),
  atom_id: z.string().optional().nullable(),
  canonical_atom: z.string().optional().nullable(),
  canonical_atoms: z.array(z.string()).optional().nullable(),
  intensity: factor1to4,
  context_impact: factor1to4,
  legal_sensitivity: factor1to4,
  audience_risk: factor1to4,
  title_ar: z.string().optional().nullable().transform((v) => v ?? "مخالفة محتوى"),
  description_ar: z.string().optional().nullable().transform((v) => v ?? ""),
  // Backend computes severity from factors when canonical_atom + factors present; legacy AI may still send severity.
  severity: z.enum(["low", "medium", "high", "critical"]).optional().nullable().transform((v) => v ?? null),
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

const auditorRulingSchema = z.enum(["violation", "needs_review", "context_ok"]);
const confidenceSchema = z.preprocess(toNullableNumber, z.number().min(0).max(1).nullable().optional())
  .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : null));

export const auditorAssessmentSchema = z.object({
  canonical_finding_id: z.string().min(1),
  title_ar: z.string().optional().nullable().transform((v) => v ?? "مخالفة محتوى"),
  final_ruling: auditorRulingSchema,
  rationale_ar: z.string().optional().nullable().transform((v) => v ?? "يتطلب تقييم مراجع مختص."),
  rationale_quality_tags: z.array(z.string()).optional().default([]),
  ruling_certainty_band: z.enum(["high", "medium", "low"]).optional().nullable().transform((v) => v ?? null),
  contradiction_flag: z.boolean().optional().nullable().transform((v) => v ?? false),
  pillar_id: z.string().optional().nullable().transform((v) => v ?? null),
  primary_article_id: z.preprocess(toNullableNumber, z.number().int().min(1).max(25).nullable().optional())
    .transform((v) => (typeof v === "number" ? v : null)),
  related_article_ids: z.array(z.preprocess(toNullableNumber, z.number().int().min(1).max(25))).optional().default([]),
  confidence: z.preprocess(toNullableNumber, z.number().min(0).max(1))
    .transform((v) => (typeof v === "number" ? Math.max(0, Math.min(1, v)) : 0.7)),
  confidence_breakdown: z.object({
    lexical: confidenceSchema,
    context: confidenceSchema,
    policy: confidenceSchema,
  }).optional().default({ lexical: null, context: null, policy: null }),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().nullable().transform((v) => v ?? null),
});

export const auditorOutputSchema = z.object({
  assessments: z.array(auditorAssessmentSchema),
});

export type AuditorAssessment = z.infer<typeof auditorAssessmentSchema>;
export type AuditorOutput = z.infer<typeof auditorOutputSchema>;

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

export function parseAuditorOutput(raw: string): AuditorOutput {
  const json = extractJsonFromText(raw);
  const parsed = JSON.parse(json) as { assessments?: Array<Record<string, unknown>> };
  const list = Array.isArray(parsed.assessments) ? parsed.assessments : [];
  for (const row of list) {
    if ((row.rationale_ar == null || String(row.rationale_ar).trim() === "") && typeof row.rationale === "string" && row.rationale.trim() !== "") {
      row.rationale_ar = row.rationale;
    }
  }
  return auditorOutputSchema.parse(parsed);
}
