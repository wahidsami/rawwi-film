/**
 * Regression test for responseMapper canonical article synthesis.
 */
import { strict as assert } from "node:assert";

import { createLegalDecision } from "../legal/legalResult.js";
import { mapLegalDecisionToFindings } from "../runtime/findingMapper.js";
import { mapV3ProviderResponse } from "./responseMapper.js";

function testApplicableArticlesDoNotSynthesizePassEvaluations(): void {
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

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 0);
  assert.equal(mapped.reasonedDecision.applicableArticles[0], 8);

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

  assert.equal(findings.length, 0);
  console.log("✓ response mapper preserves applicable_articles without synthesizing PASS article evaluations");
}

function testCanonicalConceptFirstContractSynthesizesPrimaryPassOnly(): void {
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
        confidence: 0.92,
      },
      evidence: {
        candidates: [{ text: "هذا الكلام يمس الكرامة", startOffset: 4, endOffset: 22, confidence: 0.96, source: "chunk" }],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.96,
      },
      semantic: {
        semanticMeaning: "The evidence is a direct insult affecting dignity.",
        narrativeIntent: "dialogue",
        conversationRole: "speaker",
        sceneRole: "dialogue scene",
        speaker: "speaker",
        listener: "listener",
        target: "listener",
        victim: "listener",
        emotion: "neutral",
        riskContext: "medium",
        confidence: 0.91,
      },
      context: {
        storyMemory: "Memory",
        sceneMemory: "Scene",
        localContext: "A: هذا الكلام يمس الكرامة",
        chunkContext: "chunk_index=2",
        neighboringSentences: ["Before", "After"],
        narrativeContext: "dialogue",
        confidence: 0.89,
      },
      reasoned_decision: {
        legal_concepts: ["insult", "dignity"],
        knowledge_domains: ["profanity", "privacy"],
        candidate_articles: [4, 8, 14],
        primary_article: 4,
        secondary_articles: [8, 14],
        reasoning: "Identify the concept first, map domains, then rank candidate articles.",
        supporting_evidence: ["هذا الكلام يمس الكرامة"],
        contradicting_evidence: [],
        applicable_articles: [4],
        rejected_articles: [8, 14],
        risk_analysis: "Low risk because the evidence is direct.",
        narrative_analysis: "Direct dialogue with no exception cues.",
        human_like_explanation: "A human reviewer would treat this as a direct concept-to-article case.",
        recommendation: "Support the primary article while keeping the legal engine authoritative.",
        confidence: 0.96,
      },
    },
  }));

  assert.equal(mapped.reasonedDecision.legalConcepts?.join(","), "insult,dignity");
  assert.equal(mapped.reasonedDecision.knowledgeDomains?.join(","), "profanity,privacy");
  assert.equal(mapped.reasonedDecision.candidateArticles?.join(","), "4,8,14");
  assert.equal(mapped.reasonedDecision.primaryArticle, 4);
  assert.equal(mapped.reasonedDecision.secondaryArticles?.join(","), "8,14");
  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 0);

  const legalDecision = createLegalDecision({
    moduleId: "v3_01_religion",
    moduleTitle: "Religion Reviewer",
    articleIds: [4, 8, 14],
    applies: true,
    status: "accept",
    reason: "Support the primary article while keeping the legal engine authoritative.",
    confidence: 0.96,
    semantic: {
      semanticMeaning: "The evidence is a direct insult affecting dignity.",
      narrativeIntent: "dialogue",
      conversationRole: "speaker",
      sceneRole: "dialogue scene",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "neutral",
      riskContext: "medium",
      confidence: 0.91,
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
      confidence: 0.92,
      notes: [],
    },
    evidence: {
      candidates: [{ text: "هذا الكلام يمس الكرامة", startOffset: 4, endOffset: 22, confidence: 0.96, source: "chunk", notes: [] }],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.96,
      notes: [],
    },
    context: {
      storyMemory: "Memory",
      sceneMemory: "Scene",
      localContext: "A: هذا الكلام يمس الكرامة",
      chunkContext: "chunk_index=2",
      neighboringSentences: ["Before", "After"],
      narrativeContext: "dialogue",
      confidence: 0.89,
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
      responseId: "resp_2",
      responseTimestamp: "2026-07-18T00:00:00.000Z",
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

  assert.equal(findings.length, 0);
  console.log("✓ response mapper preserves canonical concept/domain/article ranking without synthesizing PASS evaluations");
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

  assert.equal(mapped.reasonedDecision.articleEvaluations.length, 0);
  assert.equal(mapped.reasonedDecision.primaryArticle, 11);
  console.log("✓ response mapper preserves applicable_articles without synthesizing PASS evaluations");
}

function main(): void {
  testApplicableArticlesDoNotSynthesizePassEvaluations();
  testCanonicalConceptFirstContractSynthesizesPrimaryPassOnly();
  testCanonicalArticleResolverIsApplied();
  console.log("\nAll response mapper normalization tests passed.");
}

main();
