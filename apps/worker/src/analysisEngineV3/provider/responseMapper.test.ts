/**
 * Regression test for responseMapper canonical article synthesis.
 */
import { strict as assert } from "node:assert";

import { createLegalDecision } from "../legal/legalResult.js";
import { mapLegalDecisionToFindings } from "../runtime/findingMapper.js";
import { mapV3ProviderResponse } from "./responseMapper.js";

function testApplicableArticlesSynthesizePassEvaluations(): void {
  const mapped = mapV3ProviderResponse(JSON.stringify({
    reasoning: {
      narrative: {
        speaker: "speaker",
        listener: "listener",
        target: "listener",
        narrativeVoice: "dialogue",
        sceneType: "dialogue scene",
        narrativeIntent: "dialogue",
        storyPosition: "opening",
        relationship: "peer",
        emotionalTone: "neutral",
        condemnation: false,
        approval: false,
        neutrality: true,
        historicalContext: false,
        dream: false,
        flashback: false,
        comedy: false,
        satire: false,
        threat: false,
        instruction: false,
        news: false,
        documentary: false,
        dialogue: true,
        narration: false,
        sceneDescription: false,
        confidence: 0.91,
      },
      evidence: {
        candidates: [{ text: "هذا الكلام إساءة دينية", startOffset: 10, endOffset: 28, confidence: 0.94, source: "chunk" }],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.94,
      },
      semantic: {
        semanticMeaning: "The evidence is direct dialogue.",
        narrativeIntent: "dialogue",
        conversationRole: "speaker",
        sceneRole: "dialogue scene",
        speaker: "speaker",
        listener: "listener",
        target: "listener",
        victim: "listener",
        emotion: "neutral",
        riskContext: "medium",
        confidence: 0.9,
      },
      context: {
        storyMemory: "Memory",
        sceneMemory: "Scene",
        localContext: "A: هذا الكلام إساءة دينية",
        chunkContext: "chunk_index=1",
        neighboringSentences: ["Before", "After"],
        narrativeContext: "dialogue",
        confidence: 0.88,
      },
      reasoned_decision: {
        reasoning: "The model found one applicable article and did not emit article_evaluations.",
        alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
        supporting_evidence: ["هذا الكلام إساءة دينية"],
        contradicting_evidence: [],
        applicable_articles: [8],
        rejected_articles: [],
        risk_analysis: "Low risk because the evidence is direct.",
        narrative_analysis: "Direct dialogue with no exception cues.",
        human_like_explanation: "A human reviewer would treat this as a straightforward religion case.",
        recommendation: "Support the finding while keeping the legal engine authoritative.",
        confidence: 0.94,
      },
    },
  }));

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 1);
  assert.equal(mapped.reasonedDecision.articleEvaluations[0]?.articleId, 8);
  assert.equal(mapped.reasonedDecision.articleEvaluations[0]?.status, "PASS");

  const legalDecision = createLegalDecision({
    moduleId: "v3_01_religion",
    moduleTitle: "Religion Reviewer",
    articleIds: [8],
    applies: true,
    status: "accept",
    reason: "Support the finding while keeping the legal engine authoritative.",
    confidence: 0.94,
    semantic: {
      semanticMeaning: "The evidence is direct dialogue.",
      narrativeIntent: "dialogue",
      conversationRole: "speaker",
      sceneRole: "dialogue scene",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "neutral",
      riskContext: "medium",
      confidence: 0.9,
      notes: [],
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "dialogue",
      storyPosition: "opening",
      relationship: "peer",
      emotionalTone: "neutral",
      condemnation: false,
      approval: false,
      neutrality: true,
      historicalContext: false,
      dream: false,
      flashback: false,
      comedy: false,
      satire: false,
      threat: false,
      instruction: false,
      news: false,
      documentary: false,
      dialogue: true,
      narration: false,
      sceneDescription: false,
      confidence: 0.91,
      notes: [],
    },
    evidence: {
      candidates: [{ text: "هذا الكلام إساءة دينية", startOffset: 10, endOffset: 28, confidence: 0.94, source: "chunk", notes: [] }],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.94,
      notes: [],
    },
    context: {
      storyMemory: "Memory",
      sceneMemory: "Scene",
      localContext: "A: هذا الكلام إساءة دينية",
      chunkContext: "chunk_index=1",
      neighboringSentences: ["Before", "After"],
      narrativeContext: "dialogue",
      confidence: 0.88,
      notes: [],
    },
    exceptions: [],
    finding: null,
    trace: ["finding_built"],
  });

  const findings = mapLegalDecisionToFindings({
    decision: legalDecision,
    reasonedDecision: mapped.reasonedDecision,
    chunkStart: 0,
    chunkEnd: 40,
    startLine: 1,
    endLine: 1,
    diagnostics: {
      engineVersion: "v3",
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponseHash: "raw",
      responseId: "resp_1",
      responseTimestamp: "2026-07-17T00:00:00.000Z",
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      executionSignatureHash: "execution",
      stageHashes: [],
      stageTimings: [],
      subjectModuleId: "v3_01_religion",
      chunkHash: "chunk",
      findingCount: 1,
    } as never,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.article_id, 8);
  assert.equal(findings[0]?.evidence_snippet, "هذا الكلام إساءة دينية");
  console.log("✓ response mapper synthesizes PASS article evaluations from applicable_articles");
}

function testCanonicalArticleResolverIsApplied(): void {
  const mapped = mapV3ProviderResponse(JSON.stringify({
    reasoning: {
      narrative: {
        speaker: "speaker",
        listener: "listener",
        target: "listener",
        narrativeVoice: "dialogue",
        sceneType: "dialogue scene",
        narrativeIntent: "dialogue",
        storyPosition: "opening",
        relationship: "peer",
        emotionalTone: "neutral",
        condemnation: false,
        approval: false,
        neutrality: true,
        historicalContext: false,
        dream: false,
        flashback: false,
        comedy: false,
        satire: false,
        threat: false,
        instruction: false,
        news: false,
        documentary: false,
        dialogue: true,
        narration: false,
        sceneDescription: false,
        confidence: 0.91,
      },
      evidence: {
        candidates: [{ text: "هذا الكلام إساءة دينية", startOffset: 10, endOffset: 28, confidence: 0.94, source: "chunk" }],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.94,
      },
      semantic: {
        semanticMeaning: "The evidence is direct dialogue.",
        narrativeIntent: "dialogue",
        conversationRole: "speaker",
        sceneRole: "dialogue scene",
        speaker: "speaker",
        listener: "listener",
        target: "listener",
        victim: "listener",
        emotion: "neutral",
        riskContext: "medium",
        confidence: 0.9,
      },
      context: {
        storyMemory: "Memory",
        sceneMemory: "Scene",
        localContext: "A: هذا الكلام إساءة دينية",
        chunkContext: "chunk_index=1",
        neighboringSentences: ["Before", "After"],
        narrativeContext: "dialogue",
        confidence: 0.88,
      },
      reasoned_decision: {
        reasoning: "The model found one applicable article and did not emit article_evaluations.",
        alternative_interpretations: ["It could be quoted language, but the scene supports literal use."],
        supporting_evidence: ["هذا الكلام إساءة دينية"],
        contradicting_evidence: [],
        applicable_articles: [11],
        rejected_articles: [],
        risk_analysis: "Low risk because the evidence is direct.",
        narrative_analysis: "Direct dialogue with no exception cues.",
        human_like_explanation: "A human reviewer would treat this as a straightforward religion case.",
        recommendation: "Support the finding while keeping the legal engine authoritative.",
        confidence: 0.94,
      },
    },
  }), {
    resolveCanonicalArticleId: (articleId) => (articleId === 11 ? 8 : articleId),
  });

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 1);
  assert.equal(mapped.reasonedDecision.articleEvaluations[0]?.articleId, 8);
  assert.equal(mapped.reasonedDecision.articleEvaluations[0]?.status, "PASS");
  console.log("✓ response mapper applies canonical article resolver");
}

function main(): void {
  testApplicableArticlesSynthesizePassEvaluations();
  testCanonicalArticleResolverIsApplied();
  console.log("\nAll response mapper synthesis tests passed.");
}

main();
