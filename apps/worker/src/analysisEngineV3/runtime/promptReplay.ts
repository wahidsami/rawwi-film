import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

  const replayDir = join(tmpdir(), "raawifilm-v3-prompt-replays");
  const replayPath = join(replayDir, `prompt-replay-${input.promptHash.slice(0, 16)}-${Date.now()}.json`);
  const promptLengthChars = input.systemPrompt.length + input.userPrompt.length;
  const promptTokenEstimate = estimatePromptTokens(input.systemPrompt, input.userPrompt);

  const replayRecord = {
    jobId: input.jobId ?? null,
    chunkId: input.chunkId ?? null,
    createdAt: new Date().toISOString(),
    promptHash: input.promptHash,
    modelName: input.modelName,
    promptLengthChars,
    promptTokenEstimate,
    chunkText: input.chunkText,
    evidenceSpans: input.evidenceSpans,
    candidateReviewers: input.candidateReviewers,
    candidateArticles: input.candidateArticles,
    candidateAtoms: input.candidateAtoms,
    compiledReviewerContext: input.compiledReviewerContext,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    rawProviderResponse: input.rawProviderResponse,
    parsedDecision: input.parsedDecision,
  };

  await mkdir(replayDir, { recursive: true });
  await writeFile(replayPath, JSON.stringify(replayRecord, null, 2), "utf8");
  logger.info("V3 prompt replay written", {
    replayPath,
    jobId: input.jobId ?? null,
    chunkId: input.chunkId ?? null,
    promptHash: input.promptHash,
    promptLengthChars,
    promptTokenEstimate,
    candidateReviewerCount: input.candidateReviewers.length,
    candidateArticleCount: input.candidateArticles.length,
    candidateAtomCount: input.candidateAtoms.length,
  });

  return replayPath;
}
