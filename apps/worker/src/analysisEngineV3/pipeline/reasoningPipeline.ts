import { createHash } from "node:crypto";
import { createLegalEngine } from "../legal/legalEngine.js";
import { createLegalModuleLoader } from "../legal/legalModuleLoader.js";
import { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";
import { PROFANITY_MODULE } from "../legal/modules/profanity/profanityModule.js";
import { RELIGION_MODULE } from "../legal/modules/religion/religionModule.js";
import { NATIONAL_SECURITY_MODULE } from "../legal/modules/nationalSecurity/nationalSecurityModule.js";
import { STATE_LEADERSHIP_MODULE } from "../legal/modules/stateLeadership/stateLeadershipModule.js";
import { CHILDREN_MODULE } from "../legal/modules/children/childrenModule.js";
import { VIOLENCE_MODULE } from "../legal/modules/violence/violenceModule.js";
import { SEXUALITY_MODULE } from "../legal/modules/sexuality/sexualityModule.js";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";
import { createV3PipelineContext } from "./pipelineContext.js";
import { runContextStage } from "./contextStage.js";
import { runEvidenceStage } from "./evidenceStage.js";
import { runNarrativeStage } from "./narrativeStage.js";
import { createV3PipelineResult } from "./pipelineResult.js";
import { runSemanticStage } from "./semanticStage.js";
import type { V3PipelineInput, V3PipelineStageTrace } from "./pipelineTypes.js";
import type { V3PipelineResult } from "./pipelineResult.js";

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalStringify(item)}`).join(",")}}`;
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(canonicalStringify(value), "utf8").digest("hex");
}

function freezeStage<T>(stage: T): T {
  if (stage && typeof stage === "object") {
    for (const value of Object.values(stage as Record<string, unknown>)) {
      if (value && typeof value === "object") freezeStage(value);
    }
    return Object.freeze(stage);
  }
  return stage;
}

function buildRegistry(input: V3PipelineInput["registry"]): LegalModuleRegistry {
  if (input) return input;
  return new LegalModuleRegistry().register(PROFANITY_MODULE).register(RELIGION_MODULE).register(STATE_LEADERSHIP_MODULE).register(NATIONAL_SECURITY_MODULE).register(CHILDREN_MODULE).register(VIOLENCE_MODULE).register(SEXUALITY_MODULE);
}

export function runV3ReasoningPipeline(input: V3PipelineInput): V3PipelineResult {
  const context = createV3PipelineContext({ moduleId: input.moduleId, chunk: input.chunk, glossary: input.glossary });
  const diagnosticsEnabled = Boolean(input.diagnostics?.enabled);
  const stageTrace: V3PipelineStageTrace = ["narrative", "evidence", "semantic", "context", "intelligence", "legal"];
  const stageHashes: { stage: V3PipelineStageTrace[number]; hash: string }[] = [];
  const stageTimings: { stage: V3PipelineStageTrace[number]; durationMs: number | null }[] = [];

  const markStage = <T>(stage: V3PipelineStageTrace[number], fn: () => T): T => {
    const start = diagnosticsEnabled ? performance.now() : 0;
    const result = fn();
    const durationMs = diagnosticsEnabled ? Number((performance.now() - start).toFixed(3)) : null;
    stageHashes.push({ stage, hash: hashValue(result) });
    stageTimings.push({ stage, durationMs });
    return result;
  };

  const narrative = freezeStage(markStage("narrative", () => runNarrativeStage(context.chunk)));
  const evidence = freezeStage(markStage("evidence", () => runEvidenceStage(context.chunk)));
  const semantic = freezeStage(markStage("semantic", () => runSemanticStage(narrative, evidence)));
  const contextResult = freezeStage(markStage("context", () =>
    runContextStage({
      chunk: context.chunk,
      narrative,
      evidence,
      semantic,
    }),
  ));

  const intelligence = freezeStage(markStage("intelligence", () =>
    buildIntelligenceContext({
      moduleId: context.moduleId,
      storyMemory: context.chunk.storyMemory ?? null,
      narrative,
      evidence,
      semantic,
      context: contextResult,
      glossary: context.glossary,
    }),
  ));

  const registry = buildRegistry(input.registry ?? null);
  const engine = createLegalEngine(createLegalModuleLoader(registry));
  const legalDecision = freezeStage(
    markStage("legal", () =>
      engine.evaluate({
        moduleId: context.moduleId,
        intelligence,
      }),
    ),
  );

  return createV3PipelineResult(
    freezeStage({
      moduleId: context.moduleId,
      chunk: context.chunk,
      narrative,
      evidence,
      semantic,
      context: contextResult,
      intelligence,
      legalDecision,
      stageTrace,
      stageHashes,
      stageTimings,
    }),
  );
}

export function renderPipelineHash(result: V3PipelineResult): string {
  return hashValue(result);
}
