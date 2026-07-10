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
  rendered_system_prompt?: string | null;
  rendered_user_prompt?: string | null;
  parsed_judge_response?: unknown;
  raw_finding_count?: number | null;
  parsed_finding_count?: number | null;
  diagnostic_kind?: "judge_call" | "chunk_final" | "validated_snapshot" | "pass_output_snapshot" | "raw_judge_snapshot";
  pass_name?: string | null;
  findings_json?: unknown;
  finding_count?: number | null;
  judge_model?: string | null;
  finish_reason?: string | null;
  openai_usage?: unknown;
  openai_response_id?: string | null;
  raw_response_timestamp?: string | null;
  parse_status?: "SUCCESS" | "REPAIRED" | "SALVAGED" | "FAILED" | null;
  repair_reason?: string | null;
  salvage_reason?: string | null;
  repaired_finding_count?: number | null;
  salvaged_finding_count?: number | null;
  parser_validation_errors?: unknown;
  grounded_finding_count?: number | null;
  validated_finding_count?: number | null;
  validated_findings_json?: unknown;
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
      pass_name: row.pass_name ?? null,
      judge_model: row.judge_model ?? null,
      finish_reason: row.finish_reason ?? null,
      openai_usage: row.openai_usage ?? null,
      openai_response_id: row.openai_response_id ?? null,
      raw_response_timestamp: row.raw_response_timestamp ?? null,
      parse_status: row.parse_status ?? null,
      repair_reason: row.repair_reason ?? null,
      salvage_reason: row.salvage_reason ?? null,
      repaired_finding_count: row.repaired_finding_count ?? null,
      salvaged_finding_count: row.salvaged_finding_count ?? null,
      parser_validation_errors: row.parser_validation_errors ?? null,
      prompt_hash: promptHash,
      router_candidates: row.router_candidates ?? null,
      raw_judge_response: rawJudgeResponse,
      rendered_system_prompt: row.rendered_system_prompt ?? null,
      rendered_user_prompt: row.rendered_user_prompt ?? null,
      judge_response_hash: rawJudgeResponse.length > 0 ? sha256(rawJudgeResponse) : null,
      parsed_judge_response: row.parsed_judge_response ?? null,
      findings_json: row.findings_json ?? null,
      finding_count: row.finding_count ?? null,
      raw_finding_count: computedRawFindingCount,
      parsed_finding_count: row.parsed_finding_count ?? 0,
      grounded_finding_count: row.grounded_finding_count ?? null,
      validated_finding_count: row.validated_finding_count ?? null,
      validated_findings_json: row.validated_findings_json ?? null,
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
