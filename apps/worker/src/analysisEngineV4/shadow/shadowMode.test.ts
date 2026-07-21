/**
 * Regression tests for V4 shadow mode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/shadow/shadowMode.test.ts
 */
import { strict as assert } from "node:assert";

import type { AnalysisEngine, AnalysisResult } from "../../analysisEngine/types.js";
import type { V3RuntimeFinding } from "../../analysisEngineV3/runtime/runtimeTypes.js";
import { compareShadowResults } from "./shadowComparator.js";
import { buildShadowChunkRunRecord, buildShadowEngineEvaluationRecord } from "./shadowPersistence.js";
import { runV4ShadowMode } from "./shadowExecutor.js";

function buildFinding(overrides: Partial<V3RuntimeFinding> = {}): V3RuntimeFinding {
  return {
    article_id: 4,
    atom_id: "4-1",
    canonical_atom: "ART4_ATOM_4-1",
    canonical_atoms: ["ART4_ATOM_4-1"],
    intensity: 2,
    context_impact: 2,
    legal_sensitivity: 2,
    audience_risk: 2,
    title_ar: "الألفاظ النابية",
    description_ar: "تطابق هذا السطر مع profanity.",
    severity: "medium",
    confidence: 0.9,
    is_interpretive: false,
    depiction_type: "mention",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: 0.8,
    lexical_confidence: 0.8,
    policy_confidence: 0.8,
    rationale_ar: "evidence grounded",
    final_ruling: "violation",
    detection_pass: "pass-1",
    source: "v4",
    lineage_id: "finding-1",
    parent_lineage_id: null,
    canonical_hash: "hash-1",
    evidence_hash: "evidence-1",
    evidence_snippet: "يا كلب",
    location: {
      start_offset: 12,
      end_offset: 18,
      start_line: 1,
      end_line: 1,
    },
    start_offset_global: 12,
    end_offset_global: 18,
    primary_article_id: 4,
    related_article_ids: [4],
    canonical_finding_id: "finding-1",
    pillar_id: null,
    secondary_pillar_ids: [],
    policy_links: [{ article_id: 4, atom_concept_id: "atom-1", role: "primary" }],
    ...overrides,
  };
}

function buildResult(findings: readonly V3RuntimeFinding[], engineVersion: "v3" | "v4"): AnalysisResult {
  return {
    analysisResponse: {
      diagnostics: {
        engineVersion,
      },
    } as AnalysisResult["analysisResponse"],
    findings,
    diagnostics: {
      engineVersion,
      providerName: `${engineVersion}-provider`,
      modelName: `${engineVersion}-model`,
      modelVersion: engineVersion,
      rawResponseHash: `${engineVersion}-raw`,
      responseId: `${engineVersion}-response`,
      responseTimestamp: null,
      promptHash: `${engineVersion}-prompt`,
      semanticHash: `${engineVersion}-semantic`,
      legalHash: `${engineVersion}-legal`,
      executionSignatureHash: `${engineVersion}-signature`,
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: `${engineVersion}-subject`,
      chunkHash: `${engineVersion}-chunk`,
      findingCount: findings.length,
    },
    truthLayerMeta: {
      scene_analysis_trace: {
        sceneId: "scene-1",
        nodeExecutionOrder: ["understand_scene"],
        steps: [],
      },
    },
  };
}

async function testComparatorIsDeterministic(): Promise<void> {
  const visible = buildResult([buildFinding()], "v3");
  const shadow = buildResult([buildFinding()], "v4");

  const first = compareShadowResults({ visibleResult: visible, shadowResult: shadow });
  const second = compareShadowResults({ visibleResult: visible, shadowResult: shadow });

  assert.deepStrictEqual(first, second);
  assert.equal(first.matchedFindingCount, 1);
  assert.equal(first.benchmark.findingPrecision, 1);
  assert.equal(first.benchmark.findingRecall, 1);
}

async function testShadowExecutorPersistsSeparatedPayload(): Promise<void> {
  const visible = buildResult([buildFinding()], "v3");
  const shadow = buildResult([buildFinding({ description_ar: "shadow description" })], "v4");
  const calls: unknown[] = [];
  const shadowEngine: AnalysisEngine = {
    async execute() {
      return shadow;
    },
  };

  const result = await runV4ShadowMode({
    jobContext: {
      request: {
        jobId: "job-1",
        chunkId: "chunk-1",
        scriptId: "script-1",
        versionId: "version-1",
        chunkText: "INT. ROOM - NIGHT\nفهد: يا كلب",
        chunkStart: 0,
        chunkEnd: 18,
        chunkIndex: 0,
        startLine: 1,
        endLine: 1,
        storyMemory: null,
        sceneMemory: null,
        neighboringSentences: [],
        analysisPromptContext: null,
        promptLexiconTerms: [],
        analysisSignatureContext: null,
        diagnosticsEnabled: false,
      },
    },
    visibleResult: visible,
    runKey: "run-1",
  }, {
    shadowEngine,
    persist: async (input) => {
      const chunkRunRecord = buildShadowChunkRunRecord(input);
      const evaluationRecord = buildShadowEngineEvaluationRecord(input);
      calls.push(chunkRunRecord, evaluationRecord);
      return {
        shadowRunKey: `${input.runKey}:${input.chunkId}`,
        evaluationPersisted: true,
        chunkRunPersisted: true,
      };
    },
  });

  assert.equal(result?.comparison.visibleFindingCount, 1);
  assert.equal(result?.comparison.shadowFindingCount, 1);
  assert.equal(result?.comparison.matchedFindingCount, 1);
  assert.equal(calls.length, 2);
  const chunkRunRecord = calls[0] as Record<string, unknown>;
  const evaluationRecord = calls[1] as Record<string, unknown>;
  assert.equal(String(chunkRunRecord.run_key), "shadow:run-1:chunk-1");
  assert.equal(Array.isArray((chunkRunRecord.truth_layer_meta as Record<string, unknown>).shadow_findings), true);
  assert.equal(String(evaluationRecord.engine), "v4");
  assert.equal(String(evaluationRecord.mode), "shadow");
}

async function main(): Promise<void> {
  await testComparatorIsDeterministic();
  console.log("✓ shadow comparator is deterministic");
  await testShadowExecutorPersistsSeparatedPayload();
  console.log("✓ shadow executor persists separated V4 payload");
  console.log("\nAll V4 shadow mode tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
