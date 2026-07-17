import { supabase } from "../../db.js";
import { canonicalStringify } from "../../canonicalJson.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";

function estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
  return Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
}

export type V3PromptReplayFileInput = Readonly<{
  jobId?: string | null;
  chunkId?: string | null;
  promptHash: string;
  modelName: string;
  chunkText: string;
  evidenceSpans: readonly unknown[];
  candidateReviewers: readonly unknown[];
  candidateArticles: readonly unknown[];
  candidateAtoms: readonly unknown[];
  compiledReviewerContext: unknown;
  systemPrompt: string;
  userPrompt: string;
  rawProviderResponse: unknown;
  parsedDecision: unknown;
}>;

export async function writeV3PromptReplayFile(input: V3PromptReplayFileInput): Promise<string | null> {
  if (!config.V3_DIAGNOSTIC_MODE) return null;
  if (!input.jobId || !input.chunkId) return null;

  const promptLengthChars = input.systemPrompt.length + input.userPrompt.length;
  const promptTokenEstimate = estimatePromptTokens(input.systemPrompt, input.userPrompt);
  const compiledReviewerContextText = canonicalStringify(input.compiledReviewerContext);

  const replayRow = {
    job_id: input.jobId,
    chunk_id: input.chunkId,
    chunk_text: input.chunkText,
    evidence_spans: input.evidenceSpans,
    candidate_reviewers: input.candidateReviewers,
    candidate_articles: input.candidateArticles,
    candidate_atoms: input.candidateAtoms,
    compiled_reviewer_context: compiledReviewerContextText,
    system_prompt: input.systemPrompt,
    user_prompt: input.userPrompt,
    raw_provider_response: input.rawProviderResponse,
    parsed_decision: input.parsedDecision,
  };

  try {
    const { data, error } = await supabase
      .from("analysis_prompt_replays")
      .upsert(replayRow, { onConflict: "job_id,chunk_id" })
      .select("id, job_id, chunk_id")
      .single();

    if (error) {
      logger.warn("V3 prompt replay insert failed", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        promptHash: input.promptHash,
        modelName: input.modelName,
        error: error.message,
        errorCode: error.code,
        errorDetails: error.details,
        errorHint: error.hint,
      });
      return null;
    }

    const replayPath = `analysis_prompt_replays/${data.id}`;
    logger.info("V3 prompt replay stored", {
      replayPath,
      jobId: input.jobId,
      chunkId: input.chunkId,
      promptHash: input.promptHash,
      modelName: input.modelName,
      promptLengthChars,
      promptTokenEstimate,
      candidateReviewerCount: input.candidateReviewers.length,
      candidateArticleCount: input.candidateArticles.length,
      candidateAtomCount: input.candidateAtoms.length,
    });

    return replayPath;
  } catch (error) {
    logger.warn("V3 prompt replay insert failed", {
      jobId: input.jobId,
      chunkId: input.chunkId,
      promptHash: input.promptHash,
      modelName: input.modelName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
    return null;
  }
}
