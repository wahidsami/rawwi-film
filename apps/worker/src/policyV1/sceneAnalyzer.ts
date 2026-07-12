import { callJudgeRaw } from "../openai.js";
import type { GCAMArticle } from "../gcam.js";
import { logger } from "../logger.js";
import { extractRawFindingCount, persistJudgeDiagnostic } from "../judgeDiagnostics.js";
import { normalizeSceneAnalysisResult, type SceneAnalysisResult } from "./sceneEventSchema.js";
import type { AnalysisExecutionSignatureInput } from "../executionSignature.js";

const SCENE_ANALYZER_SYSTEM_PROMPT = `You are a neutral scene-analysis extractor for regulatory workflows.
Return JSON only in this shape:
{
  "events": [
    {
      "event_id": "evt-1",
      "event_type": "physical_abuse|verbal_abuse|threat|religious_reference|state_leadership_reference|national_security_reference|historical_claim|sexual_content|drug_or_alcohol|bullying|other",
      "actor_label": "string|null",
      "target_label": "string|null",
      "target_class": "child|woman|person_with_disability|public_group|state_or_leadership|religious_symbol|unknown",
      "action_mode": "speech|action|narration|visual|unknown",
      "intent_signal": "harm|insult|advocacy|instruction|ridicule|factual_claim|unknown",
      "framing": "positive|neutral|negative|unclear",
      "promoted": true,
      "glorified": false,
      "repeated": false,
      "documentary_context": false,
      "factual_claim_present": false,
      "evidence_snippet": "exact short quote",
      "start_offset": 10,
      "end_offset": 25,
      "extraction_confidence": 0.82
    }
  ]
}

Rules:
- Extract facts/events only. Do NOT output legal categories or violations.
- Do NOT infer incidents that are not explicitly supported by the provided text.
- Do NOT import context from outside this chunk.
- If the same incident repeats, return separate events only when evidence snippets are materially different.
- If no event is found return {"events":[]}.
- Keep evidence_snippet short and literal from input text.
- event_id must be stable in format: "evt-<index>".
- start_offset/end_offset should be local to this chunk when possible, otherwise null.
- promoted/glorified must be true only with clear positive framing signals.`;

export async function runSceneAnalyzer(args: {
  chunkText: string;
  chunkStart: number;
  chunkEnd: number;
  jobId?: string;
  chunkId?: string;
  routerCandidates?: unknown;
  model?: string;
  temperature?: number;
  seed?: number;
  analysis_signature_context?: AnalysisExecutionSignatureInput | null;
  signal?: AbortSignal;
}): Promise<SceneAnalysisResult> {
  const model = args.model ?? "gpt-4.1";
  const temperature = args.temperature ?? 0;
  const seed = args.seed ?? 12345;

  const noArticles: GCAMArticle[] = [];
  const judgeCall = await callJudgeRaw(
    args.chunkText,
    noArticles,
    args.chunkStart,
    args.chunkEnd,
    { judge_model: model, temperature, seed, analysis_signature_context: args.analysis_signature_context ?? null },
    SCENE_ANALYZER_SYSTEM_PROMPT,
    null,
    { signal: args.signal },
  );

  if (args.jobId && args.chunkId) {
    await persistJudgeDiagnostic({
      diagnostic_kind: "raw_judge_snapshot",
      job_id: args.jobId,
      chunk_id: args.chunkId,
      pass_name: "policy_v1_scene_analyzer",
      prompt_hash: judgeCall.prompt_hash,
      router_candidates: args.routerCandidates ?? null,
      raw_judge_response: judgeCall.raw_judge_response,
      rendered_system_prompt: judgeCall.rendered_system_prompt,
      rendered_user_prompt: judgeCall.rendered_user_prompt,
      parsed_judge_response: null,
      judge_model: judgeCall.model,
      finish_reason: judgeCall.finish_reason,
      openai_usage: judgeCall.usage,
      openai_response_id: judgeCall.response_id,
      raw_response_timestamp: judgeCall.response_timestamp,
    });
  }

  try {
    const parsed = JSON.parse(judgeCall.raw_judge_response);
    const normalized = normalizeSceneAnalysisResult(parsed);
    if (args.jobId && args.chunkId) {
      const rawFindingCount = extractRawFindingCount(judgeCall.raw_judge_response);
      await persistJudgeDiagnostic({
        job_id: args.jobId,
        chunk_id: args.chunkId,
        prompt_hash: judgeCall.prompt_hash,
        router_candidates: args.routerCandidates ?? null,
        raw_judge_response: judgeCall.raw_judge_response,
        rendered_system_prompt: judgeCall.rendered_system_prompt,
        rendered_user_prompt: judgeCall.rendered_user_prompt,
        parsed_judge_response: normalized,
        raw_finding_count: rawFindingCount,
        parsed_finding_count: normalized.events.length,
      });
    }
    return normalized;
  } catch (error) {
    if (args.jobId && args.chunkId) {
      const rawFindingCount = extractRawFindingCount(judgeCall.raw_judge_response);
      await persistJudgeDiagnostic({
        job_id: args.jobId,
        chunk_id: args.chunkId,
        prompt_hash: judgeCall.prompt_hash,
        router_candidates: args.routerCandidates ?? null,
        raw_judge_response: judgeCall.raw_judge_response,
        rendered_system_prompt: judgeCall.rendered_system_prompt,
        rendered_user_prompt: judgeCall.rendered_user_prompt,
        parsed_judge_response: null,
        raw_finding_count: rawFindingCount,
        parsed_finding_count: 0,
      });
    }
    logger.warn("Scene analyzer returned non-JSON response", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { events: [] };
  }
}
