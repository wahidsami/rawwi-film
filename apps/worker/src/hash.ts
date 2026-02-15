import { createHash } from "crypto";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** evidence_hash for AI findings: article_id|atom_id|startGlobal|endGlobal|evidence_snippet */
export function evidenceHash(
  articleId: number,
  atomId: string | null,
  startGlobal: number,
  endGlobal: number,
  evidenceSnippet: string
): string {
  const atom = atomId ?? "";
  return sha256(`${articleId}|${atom}|${startGlobal}|${endGlobal}|${evidenceSnippet}`);
}

/** evidence_hash for lexicon mandatory: jobId:lexicon:article_id:term:line */
export function lexiconEvidenceHash(
  jobId: string,
  articleId: number,
  term: string,
  line: number
): string {
  return sha256(`${jobId}:lexicon:${articleId}:${term}:${line}`);
}

/**
 * Idempotency key for a chunk run:
 * hash(chunkText + routerModel + judgeModel + temp + seed + logicVersion)
 * If this key matches a previous successful run, we can skip AI calls.
 */
export function computeChunkRunKey(
  chunkText: string,
  config: {
    router_model: string;
    judge_model: string;
    temperature: number;
    seed: number;
    router_prompt_hash?: string;
    judge_prompt_hash?: string;
  },
  logicVersion = "v1"
): string {
  const routerHash = config.router_prompt_hash ?? "";
  const judgeHash = config.judge_prompt_hash ?? "";
  const data = `${chunkText}|${config.router_model}|${config.judge_model}|${config.temperature}|${config.seed}|${routerHash}|${judgeHash}|${logicVersion}`;
  return sha256(data);
}
