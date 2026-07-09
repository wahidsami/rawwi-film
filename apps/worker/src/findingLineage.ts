import { config } from "./config.js";
import { supabase } from "./db.js";
import { evidenceHash, sha256 } from "./hash.js";
import { logger } from "./logger.js";

export type LineageStageName =
  | "pass_output"
  | "canonicalization"
  | "grounding"
  | "validation"
  | "aggregation"
  | "final_report";

type MaybeLocation = {
  start_offset?: number | null;
  end_offset?: number | null;
};

export type LineageFindingLike = {
  lineage_id?: string | null;
  parent_lineage_id?: string | null;
  detection_pass?: string | null;
  article_id?: number | null;
  atom_id?: string | null;
  canonical_atom?: string | null;
  title_ar?: string | null;
  rationale_ar?: string | null;
  evidence_snippet?: string | null;
  start_offset_global?: number | null;
  end_offset_global?: number | null;
  location?: MaybeLocation | null;
  evidence_hash?: string | null;
  canonical_hash?: string | null;
};

export type LineageEventInsert = {
  job_id: string;
  chunk_id?: string | null;
  lineage_id: string;
  parent_lineage_id?: string | null;
  stage_name: LineageStageName;
  pass_name?: string | null;
  evidence_hash?: string | null;
  canonical_hash?: string | null;
  article_id?: number | null;
  atom_id?: string | null;
  start_offset?: number | null;
  end_offset?: number | null;
  reason_if_removed?: string | null;
  metadata?: Record<string, unknown> | null;
};

const LINEAGE_PERSIST_TIMEOUT_MS = 2500;

function pickStart(finding: LineageFindingLike): number {
  if (typeof finding.start_offset_global === "number") return finding.start_offset_global;
  if (typeof finding.location?.start_offset === "number") return finding.location.start_offset;
  return 0;
}

function pickEnd(finding: LineageFindingLike): number {
  if (typeof finding.end_offset_global === "number") return finding.end_offset_global;
  if (typeof finding.location?.end_offset === "number") return finding.location.end_offset;
  return pickStart(finding);
}

function normalizeEvidence(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function computeLineageCanonicalHash(finding: LineageFindingLike): string {
  return sha256(JSON.stringify({
    article_id: finding.article_id ?? null,
    atom_id: finding.atom_id ?? null,
    canonical_atom: finding.canonical_atom ?? null,
    title_ar: finding.title_ar ?? null,
    rationale_ar: finding.rationale_ar ?? null,
    pass_name: finding.detection_pass ?? null,
  }));
}

export function computeLineageEvidenceHash(finding: LineageFindingLike): string {
  const articleId = typeof finding.article_id === "number" ? finding.article_id : 0;
  const atomId = finding.atom_id ?? null;
  const start = pickStart(finding);
  const end = pickEnd(finding);
  const snippet = normalizeEvidence(finding.evidence_snippet);
  return evidenceHash(articleId, atomId, start, end, snippet);
}

export function ensureFindingLineageId(
  finding: LineageFindingLike,
  seed: { jobId: string; chunkId?: string | null; passName?: string | null; index?: number | null },
): string {
  const existing = finding.lineage_id?.trim();
  if (existing) {
    if (!finding.evidence_hash) finding.evidence_hash = computeLineageEvidenceHash(finding);
    if (!finding.canonical_hash) finding.canonical_hash = computeLineageCanonicalHash(finding);
    return existing;
  }

  const lineageSeed = JSON.stringify({
    job_id: seed.jobId,
    chunk_id: seed.chunkId ?? null,
    pass_name: seed.passName ?? finding.detection_pass ?? null,
    index: seed.index ?? null,
    article_id: finding.article_id ?? null,
    atom_id: finding.atom_id ?? null,
    canonical_atom: finding.canonical_atom ?? null,
    start_offset: pickStart(finding),
    end_offset: pickEnd(finding),
    evidence_snippet: normalizeEvidence(finding.evidence_snippet),
  });

  const lineageId = `lin_${sha256(lineageSeed).slice(0, 32)}`;
  finding.lineage_id = lineageId;
  finding.parent_lineage_id = finding.parent_lineage_id ?? null;
  finding.evidence_hash = finding.evidence_hash ?? computeLineageEvidenceHash(finding);
  finding.canonical_hash = finding.canonical_hash ?? computeLineageCanonicalHash(finding);
  return lineageId;
}

export function buildLineageEvent(
  finding: LineageFindingLike,
  args: {
    jobId: string;
    chunkId?: string | null;
    stageName: LineageStageName;
    passName?: string | null;
    reasonIfRemoved?: string | null;
    metadata?: Record<string, unknown> | null;
  },
): LineageEventInsert {
  const lineageId = ensureFindingLineageId(finding, {
    jobId: args.jobId,
    chunkId: args.chunkId ?? null,
    passName: args.passName ?? finding.detection_pass ?? null,
    index: null,
  });
  const startOffset = pickStart(finding);
  const endOffset = pickEnd(finding);

  return {
    job_id: args.jobId,
    chunk_id: args.chunkId ?? null,
    lineage_id: lineageId,
    parent_lineage_id: finding.parent_lineage_id ?? null,
    stage_name: args.stageName,
    pass_name: args.passName ?? finding.detection_pass ?? null,
    evidence_hash: finding.evidence_hash ?? computeLineageEvidenceHash(finding),
    canonical_hash: finding.canonical_hash ?? computeLineageCanonicalHash(finding),
    article_id: finding.article_id ?? null,
    atom_id: finding.atom_id ?? null,
    start_offset: startOffset,
    end_offset: endOffset,
    reason_if_removed: args.reasonIfRemoved ?? null,
    metadata: args.metadata ?? null,
  };
}

export async function persistLineageEvents(events: LineageEventInsert[]): Promise<void> {
  try {
    if (!config.ENABLE_FINDING_LINEAGE) return;
    if (events.length === 0) return;

    const insertPromise: Promise<{ error?: { message?: string } | null }> = supabase
      .from("analysis_finding_lineage_events")
      .insert(events)
      .then((result) => ({ error: result.error ?? null }))
      .catch((error: unknown) => ({
        error: { message: error instanceof Error ? error.message : String(error) },
      }));

    const timeoutPromise: Promise<{ timedOut: true }> = new Promise((resolve) => {
      setTimeout(() => resolve({ timedOut: true }), LINEAGE_PERSIST_TIMEOUT_MS);
    });

    const outcome = await Promise.race<[Awaited<typeof insertPromise> | { timedOut: true }]>([
      insertPromise,
      timeoutPromise,
    ]);

    if ("timedOut" in outcome) {
      logger.warn("Finding lineage persist timed out; continuing analysis", {
        timeoutMs: LINEAGE_PERSIST_TIMEOUT_MS,
        events: events.length,
      });
      return;
    }

    if (outcome.error) {
      logger.warn("Finding lineage persist failed; continuing analysis", {
        error: outcome.error.message ?? "unknown_error",
        events: events.length,
      });
    }
  } catch (error) {
    logger.warn("Finding lineage persist threw; continuing analysis", {
      error: error instanceof Error ? error.message : String(error),
      events: events.length,
    });
    return;
  }
}
