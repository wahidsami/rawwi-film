import { config } from "./config.js";
import { supabase } from "./db.js";
import { sha256 } from "./hash.js";
import { logger } from "./logger.js";
import { extractJsonFromText } from "./schemas.js";

export type JudgeDiagnosticInsert = {
  job_id: string;
  chunk_id: string;
  prompt_hash?: string | null;
  router_candidates?: unknown;
  raw_judge_response?: string | null;
  parsed_judge_response?: unknown;
  raw_finding_count?: number | null;
  parsed_finding_count?: number | null;
  diagnostic_kind?: "judge_call" | "chunk_final";
  grounded_finding_count?: number | null;
  validated_finding_count?: number | null;
  final_chunk_finding_count?: number | null;
  final_chunk_findings?: unknown;
  timestamp?: string;
};

export function extractRawFindingCount(rawJudgeResponse: string): number | null {
  try {
    const json = extractJsonFromText(rawJudgeResponse);
    const parsed = JSON.parse(json) as { findings?: unknown };
    if (!Array.isArray(parsed.findings)) return null;
    return parsed.findings.length;
  } catch {
    return null;
  }
}

export async function persistJudgeDiagnostic(row: JudgeDiagnosticInsert): Promise<void> {
  if (!config.ENABLE_AI_DIAGNOSTICS) return;

  const rawJudgeResponse = row.raw_judge_response ?? "";
  const computedRawFindingCount =
    row.raw_finding_count !== undefined ? row.raw_finding_count : extractRawFindingCount(rawJudgeResponse);
  const promptHash = row.prompt_hash ?? "";

  try {
    logger.info("[JudgeDiagnostics] About to insert diagnostics...", {
      job_id: row.job_id,
      chunk_id: row.chunk_id,
      diagnostic_kind: row.diagnostic_kind ?? "judge_call",
      raw_finding_count: computedRawFindingCount,
      parsed_finding_count: row.parsed_finding_count ?? 0,
      grounded_finding_count: row.grounded_finding_count ?? null,
      validated_finding_count: row.validated_finding_count ?? null,
      final_chunk_finding_count: row.final_chunk_finding_count ?? null,
    });

    const { error } = await supabase.from("analysis_judge_diagnostics").insert({
      job_id: row.job_id,
      chunk_id: row.chunk_id,
      diagnostic_kind: row.diagnostic_kind ?? "judge_call",
      prompt_hash: promptHash,
      router_candidates: row.router_candidates ?? null,
      raw_judge_response: rawJudgeResponse,
      judge_response_hash: rawJudgeResponse.length > 0 ? sha256(rawJudgeResponse) : null,
      parsed_judge_response: row.parsed_judge_response ?? null,
      raw_finding_count: computedRawFindingCount,
      parsed_finding_count: row.parsed_finding_count ?? 0,
      grounded_finding_count: row.grounded_finding_count ?? null,
      validated_finding_count: row.validated_finding_count ?? null,
      final_chunk_finding_count: row.final_chunk_finding_count ?? null,
      final_chunk_findings: row.final_chunk_findings ?? null,
      timestamp: row.timestamp ?? new Date().toISOString(),
    });

    if (error) {
      logger.warn("[JudgeDiagnostics] Insert failed", {
        job_id: row.job_id,
        chunk_id: row.chunk_id,
        diagnostic_kind: row.diagnostic_kind ?? "judge_call",
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      return;
    }

    logger.info("[JudgeDiagnostics] Insert successful.", {
      job_id: row.job_id,
      chunk_id: row.chunk_id,
      diagnostic_kind: row.diagnostic_kind ?? "judge_call",
    });
  } catch (error) {
    logger.warn("[JudgeDiagnostics] Insert failed", {
      job_id: row.job_id,
      chunk_id: row.chunk_id,
      diagnostic_kind: row.diagnostic_kind ?? "judge_call",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
