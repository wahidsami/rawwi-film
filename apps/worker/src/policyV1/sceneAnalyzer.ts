import { callJudgeRaw } from "../openai.js";
import type { GCAMArticle } from "../gcam.js";
import { logger } from "../logger.js";
import { normalizeSceneAnalysisResult, type SceneAnalysisResult } from "./sceneEventSchema.js";

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
- If no event is found return {"events":[]}.
- Keep evidence_snippet short and literal from input text.`;

export async function runSceneAnalyzer(args: {
  chunkText: string;
  chunkStart: number;
  chunkEnd: number;
  model?: string;
  temperature?: number;
  seed?: number;
  signal?: AbortSignal;
}): Promise<SceneAnalysisResult> {
  const model = args.model ?? "gpt-4.1";
  const temperature = args.temperature ?? 0;
  const seed = args.seed ?? 12345;

  const noArticles: GCAMArticle[] = [];
  const raw = await callJudgeRaw(
    args.chunkText,
    noArticles,
    args.chunkStart,
    args.chunkEnd,
    { judge_model: model, temperature, seed },
    SCENE_ANALYZER_SYSTEM_PROMPT,
    null,
    { signal: args.signal },
  );

  try {
    const parsed = JSON.parse(raw);
    return normalizeSceneAnalysisResult(parsed);
  } catch (error) {
    logger.warn("Scene analyzer returned non-JSON response", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { events: [] };
  }
}
