import { supabase } from "./db.js";
import { config } from "./config.js";
import { canonicalStringify } from "./canonicalJson.js";
import { sha256 } from "./hash.js";
import { logger } from "./logger.js";

export type AnalysisExecutionSignatureInput = {
  job_id: string;
  script_id: string;
  version_id: string;
  created_at: string | null;
  provider_name: string;
  model_name: string;
  model_version: string | null;
  router_model_name: string | null;
  auditor_model_name: string | null;
  rationale_model_name: string | null;
  temperature: number | null;
  top_p: number | null;
  seed: number | null;
  max_tokens: number | null;
  reasoning_effort: string | null;
  response_format: string | null;
  pipeline_version: string | null;
  analysis_engine_version: string | null;
  memory_version: string | null;
  scene_memory_version: string | null;
  script_memory_version: string | null;
  evidence_pinning_version: string | null;
  router_version: string | null;
  grounding_version: string | null;
  validator_version: string | null;
  aggregation_version: string | null;
  auditor_version: string | null;
  violation_system_version: string | null;
  summary_hash: string | null;
  memory_hash: string | null;
  summary_source: "cache" | "generated" | "unavailable" | null;
  summary_generation_timestamp: string | null;
  summary_model: string | null;
  summary_version: string | null;
  chunk_size: number | null;
  overlap_size: number | null;
  total_chunks: number | null;
  total_detection_passes: number | null;
  diagnostics_enabled: boolean | null;
  lineage_enabled: boolean | null;
  system_prompt_hash?: string | null;
  user_prompt_hash?: string | null;
  combined_prompt_hash?: string | null;
};

type PersistedSignature = AnalysisExecutionSignatureInput & {
  system_prompt_hash: string | null;
  user_prompt_hash: string | null;
  combined_prompt_hash: string | null;
  analysis_signature_hash: string;
};

const inFlightSignatures = new Map<string, Promise<void>>();
const SIGNATURE_PERSIST_TIMEOUT_MS = 5000;
const SIGNATURE_CACHE_MAX_ENTRIES = 4096;
const SIGNATURE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const persistedSignatureJobs = new Map<string, number>();

function hasPersistedSignature(jobId: string): boolean {
  const expiresAt = persistedSignatureJobs.get(jobId);
  if (expiresAt == null) return false;
  if (expiresAt <= Date.now()) {
    persistedSignatureJobs.delete(jobId);
    return false;
  }
  persistedSignatureJobs.delete(jobId);
  persistedSignatureJobs.set(jobId, expiresAt);
  return true;
}

function markPersistedSignature(jobId: string): void {
  const expiresAt = Date.now() + SIGNATURE_CACHE_TTL_MS;
  if (persistedSignatureJobs.has(jobId)) {
    persistedSignatureJobs.delete(jobId);
  }
  persistedSignatureJobs.set(jobId, expiresAt);
  while (persistedSignatureJobs.size > SIGNATURE_CACHE_MAX_ENTRIES) {
    const oldestKey = persistedSignatureJobs.keys().next().value as string | undefined;
    if (!oldestKey) break;
    persistedSignatureJobs.delete(oldestKey);
  }
}

function computeSignatureHash(row: Omit<PersistedSignature, "analysis_signature_hash">): string {
  return sha256(canonicalStringify(row));
}

export async function persistAnalysisExecutionSignature(
  base: AnalysisExecutionSignatureInput,
  systemPrompt: string,
  userPrompt: string,
): Promise<void> {
  if (!base.job_id) return;
  if (hasPersistedSignature(base.job_id)) return;

  const existing = inFlightSignatures.get(base.job_id);
  if (existing) {
    await existing;
    return;
  }

  const pending = (async () => {
    const row: Omit<PersistedSignature, "analysis_signature_hash"> = {
      ...base,
      system_prompt_hash: sha256(systemPrompt),
      user_prompt_hash: sha256(userPrompt),
      combined_prompt_hash: sha256(
        canonicalStringify({
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
        }),
      ),
    };
    const analysis_signature_hash = computeSignatureHash(row);
    const insertRow: PersistedSignature = {
      ...row,
      analysis_signature_hash,
    };

    const persistPromise = supabase
      .from("analysis_execution_signatures")
      .upsert(insertRow, { onConflict: "job_id", ignoreDuplicates: true })
      .then((result) => ({ error: result.error ?? null }));
    const timeoutPromise = new Promise<{ error: { message: string } | null }>((resolve) => {
      setTimeout(
        () => resolve({ error: { message: `timed out after ${SIGNATURE_PERSIST_TIMEOUT_MS}ms` } }),
        SIGNATURE_PERSIST_TIMEOUT_MS,
      );
    });
    const { error } = (await Promise.race([persistPromise, timeoutPromise])) as { error: { message: string } | null };

    if (error) {
      logger.warn("Failed to persist analysis execution signature", {
        jobId: base.job_id,
        error: error.message,
      });
      return;
    }

    markPersistedSignature(base.job_id);
    logger.info("Analysis execution signature persisted", {
      jobId: base.job_id,
      analysisSignatureHash: analysis_signature_hash,
    });
  })();

  inFlightSignatures.set(base.job_id, pending);
  try {
    await pending;
  } finally {
    inFlightSignatures.delete(base.job_id);
  }
}

export function resolveExecutionSignatureDefaults() {
  return {
    provider_name: "openai",
    model_version: null as string | null,
    top_p: null as number | null,
    reasoning_effort: null as string | null,
    response_format: "json_object",
    diagnostics_enabled: config.ENABLE_AI_DIAGNOSTICS,
    lineage_enabled: config.ENABLE_FINDING_LINEAGE,
  };
}
