/**
 * Regression tests for temporary V3 stabilization mode.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/stabilizationMode.v3.test.ts
 */
import { strict as assert } from "node:assert";

process.env.SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.V3_STABILIZATION_MODE = "true";

const [
  { validateReasonedDecisionAgainstEvidence },
  { mapLegalDecisionToFindings },
  { createLegalDecision },
  { applyLegalArticleRanking, rankLegalArticles },
  { applyPersistenceFilters },
] = await Promise.all([
  import("./provider/reasonedDecisionValidation.js"),
  import("./runtime/findingMapper.js"),
  import("./legal/legalResult.js"),
  import("./legalRanking/legalArticleRanker.js"),
  import("../pipeline.js"),
]);

function makePromptInput() {
  return {
    reasoningContract: { title: "Reasoning", stages: [] },
    decisionGraph: { title: "Decision", nodes: [] },
    semanticLayer: { title: "Semantic" },
    storyMemory: null,
    chunkContext: {
      localChunk: "يا كلب",
      neighboringSentences: [],
      sceneMemory: "dialogue scene",
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      articleIds: [4],
    },
    glossary: { title: "Glossary", entries: [] },
    outputSchema: { title: "Output", fields: [] },
    compiledReviewerContext: {
      academyRoot: "academy",
      fingerprint: "fingerprint",
      generatedAt: "2026-07-18T00:00:00.000Z",
      selection: {
        selectedReviewerIds: ["v4_11_profanity"],
        selectedReviewerLabels: ["Profanity Reviewer"],
        selectedAcademyFolders: ["profanity"],
        rejectedReviewerIds: [],
        rejectedReviewerLabels: [],
        loadedAcademyCount: 1,
        skippedAcademyCount: 0,
        knowledgeReductionPercent: 0,
        routingConfidence: 0.99,
        routingReason: "Stable route.",
        lowConfidence: false,
        reviewerScores: [],
      },
      universalManuals: [],
      selectedReviewerManuals: [],
      rejectedReviewerManuals: [],
      selectedReviewerPackages: [],
      selectedArticles: [
        {
          articleId: "4",
          reviewer: "Profanity",
          title: "Article 4",
          protectedInterest: "",
          purpose: "",
          neighboringArticles: [],
          atoms: ["4-1"],
          inherits: [],
          priority: null,
          runtime: null,
          retrieval: null,
          status: null,
          sourcePath: "article_4.md",
        },
      ],
      selectedAtoms: [
        {
          atomId: "4-1",
          articleId: "4",
          reviewer: "Profanity",
          title: "Atom 4-1",
          protectedInterest: "",
          inherits: [],
          priority: null,
          runtime: null,
          retrieval: null,
          status: null,
          sourcePath: "atom_4_1.md",
        },
      ],
      loadedManualCount: 0,
      loadedReviewerCount: 1,
      loadedArticleCount: 1,
      loadedAtomCount: 1,
      loadedCharacterCount: 0,
      estimatedTokenCount: 1,
      promptCharacterCount: 0,
      promptTokenEstimate: 1,
      promptPreview: "",
      candidateDiagnostics: {
        enabled: true,
        subjectModuleId: "v4_11_profanity",
        subjectModuleTitle: "الألفاظ النابية",
        subjectModuleFolders: ["profanity"],
        selectedReviewerIds: ["v4_11_profanity"],
        selectedReviewerLabels: ["Profanity Reviewer"],
        selectedReviewerFolders: ["profanity"],
        selectedReviewerPackIds: ["v4_11_profanity"],
        selectedReviewerPackLabels: ["Profanity Reviewer"],
        selectedReviewerPackCount: 1,
        rejectedReviewerIds: [],
        rejectedReviewerLabels: [],
        reviewerRoutingReason: "Stable route.",
        reviewerScores: [],
        articleRanking: {
          selectedPolicyArticleIds: [4],
          selectedPolicyArticleIdsByReviewer: { v4_11_profanity: [4] },
          rejectedPolicyArticleIds: [],
          candidateArticleCount: 1,
          candidateArticleScores: [],
          articleScores: [],
          articleSelectionReason: "Stable selection.",
        },
        atomRanking: {
          selectedPolicyAtomIds: ["4-1"],
          selectedPolicyAtomIdsByArticle: { 4: ["4-1"] },
          rejectedPolicyAtomIds: [],
          candidateAtomCount: 1,
          atomScores: [],
          atomSelectionReason: "Stable selection.",
        },
      },
    },
  };
}

function makeReasonedDecisionResult() {
  return {
    narrative: {
      speaker: "A",
      listener: "B",
      target: "B",
      narrativeVoice: "dialogue",
      sceneType: "dialogue scene",
      narrativeIntent: "attack",
      storyPosition: "middle",
      relationship: null,
      emotionalTone: "hostile",
      condemnation: false,
      approval: false,
      neutrality: false,
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
      confidence: 0.95,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "يا كلب",
          startOffset: 0,
          endOffset: 6,
          confidence: 0.95,
          source: "chunk" as const,
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.95,
      notes: [],
    },
    semantic: {
      semanticMeaning: "literal profanity",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "A",
      listener: "B",
      target: "B",
      victim: "B",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.95,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "يا كلب",
      chunkContext: "chunk",
      neighboringSentences: [],
      narrativeContext: "dialogue",
      confidence: 0.95,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "The provider detected profanity in the quoted evidence.",
      alternativeInterpretations: [],
      confidence: 0.94,
      candidateArticles: [8, 11, 14],
      articleEvaluations: [
        {
          articleId: 8,
          status: "PASS" as const,
          evidence: ["يا كلب"],
          reason: "The quote is a direct profanity.",
          confidence: 0.94,
        },
      ],
      supportingEvidence: ["يا كلب"],
      contradictingEvidence: [],
      applicableArticles: [8],
      rejectedArticles: [],
      riskAnalysis: "low",
      narrativeAnalysis: "dialogue",
      humanLikeExplanation: "Direct profanity.",
      recommendation: "Approve",
    },
  };
}

function testCandidateUniverseRemainsImmutableAfterLegalRanking(): void {
  const input = makePromptInput();
  input.subjectModule.articleIds = [];
  const providerResult = makeReasonedDecisionResult();
  const ranking = rankLegalArticles({
    promptInput: input as never,
    intelligence: providerResult.semantic as never,
    reasonedDecision: providerResult.reasonedDecision as never,
    selectedReviewerIds: ["v4_11_profanity"],
    canonicalArticleOwnershipByArticleId: {},
  });
  const rankedDecision = applyLegalArticleRanking(providerResult.reasonedDecision as never, ranking);

  assert.deepEqual(providerResult.reasonedDecision.candidateArticles, [8, 11, 14], "provider candidate articles should remain immutable");
  assert.deepEqual(rankedDecision.candidateArticles, [8, 11, 14], "legal ranking must not shrink the provider article universe");
  assert.deepEqual(rankedDecision.candidateArticles, providerResult.reasonedDecision.candidateArticles, "provider and validator article universes must match");

  const validation = validateReasonedDecisionAgainstEvidence(input as never, {
    ...providerResult,
    reasonedDecision: rankedDecision,
  } as never);

  assert.equal(validation.valid, true, "validation should accept the immutable provider article universe");
  assert.deepEqual(validation.sanitizedDecision.candidateArticles, [8, 11, 14], "validator must consume the original provider article universe");
}

function buildLegalDecision() {
  return createLegalDecision({
    moduleId: "v4_11_profanity",
    moduleTitle: "Profanity Reviewer",
    articleIds: [8],
    applies: true,
    status: "accept",
    reason: "Stable profanity detection.",
    confidence: 0.94,
    semantic: makeReasonedDecisionResult().semantic,
    narrative: makeReasonedDecisionResult().narrative,
    evidence: makeReasonedDecisionResult().evidence,
    context: makeReasonedDecisionResult().context,
    exceptions: [],
    finding: null,
    trace: ["stabilization"],
  });
}

function testValidationAndMappingPreserveCandidateMismatchFinding(): void {
  const input = makePromptInput();
  const providerResult = makeReasonedDecisionResult();
  const validation = validateReasonedDecisionAgainstEvidence(input as never, providerResult as never);

  assert.equal(validation.valid, true, "candidate mismatch should be recoverable under stabilization mode");
  assert.equal(validation.sanitizedDecision.articleEvaluations.length, 1, "the article evaluation should survive validation");
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].articleId, 8, "the provider article should be preserved");

  const findings = mapLegalDecisionToFindings({
    decision: buildLegalDecision(),
    reasonedDecision: validation.sanitizedDecision,
    chunkStart: 0,
    chunkEnd: 6,
    startLine: 1,
    endLine: 1,
      diagnostics: {
        engineVersion: "v3",
        providerName: "openai",
        modelName: "gpt-4.1",
        modelVersion: null,
      rawResponseHash: "raw",
      responseId: "resp",
      responseTimestamp: null,
      promptHash: "prompt",
      semanticHash: "semantic",
      legalHash: "legal",
      executionSignatureHash: null,
      stageHashes: [] as any,
      stageTimings: [] as any,
      subjectModuleId: "v4_11_profanity",
      chunkHash: "chunk",
      findingCount: 1,
    } as any,
    gcamMapping: null,
  });

  assert.equal(findings.length, 1, "mapping should preserve the stabilized finding");
  assert.equal(findings[0].article_id, 8, "mapped finding should keep the provider article");
  assert.equal(findings[0].evidence_snippet, "يا كلب", "mapped finding should preserve the provider evidence snippet");
}

function testPersistenceKeepsV3ArticleFour(): void {
  const findings = applyPersistenceFilters({
    normalizedText: "يا كلب ويا كلب",
    findings: [
      {
        source: "v3",
        article_id: 4,
        atom_id: "4-1",
        severity: "medium",
        confidence: 0.94,
        title_ar: "Article 4",
        description_ar: "First finding",
        evidence_snippet: "يا كلب",
        start_offset_global: 0,
        end_offset_global: 6,
        start_line_chunk: 1,
        end_line_chunk: 1,
        location: {
          start_offset: 0,
          end_offset: 6,
          start_line: 1,
          end_line: 1,
        },
        canonical_atom: "4-1",
        intensity: null,
        context_impact: null,
        legal_sensitivity: null,
        audience_risk: null,
        lineage_id: null,
        parent_lineage_id: null,
        canonical_hash: null,
        evidence_hash: null,
        rationale_ar: "Reason one",
        final_ruling: "violation",
        detection_pass: "v3_runtime_profanity",
        is_interpretive: false,
        depiction_type: "unknown",
        speaker_role: "unknown",
        narrative_consequence: "unknown",
        context_window_id: null,
        context_confidence: null,
        lexical_confidence: null,
        policy_confidence: null,
        policy_links: [],
        primary_article_id: 4,
        related_article_ids: [4],
      },
      {
        source: "v3",
        article_id: 5,
        atom_id: "5-1",
        severity: "medium",
        confidence: 0.9,
        title_ar: "Article 5",
        description_ar: "Specific finding",
        evidence_snippet: "يا كلب",
        start_offset_global: 0,
        end_offset_global: 6,
        start_line_chunk: 1,
        end_line_chunk: 1,
        location: {
          start_offset: 0,
          end_offset: 6,
          start_line: 1,
          end_line: 1,
        },
        canonical_atom: "5-1",
        intensity: null,
        context_impact: null,
        legal_sensitivity: null,
        audience_risk: null,
        lineage_id: null,
        parent_lineage_id: null,
        canonical_hash: null,
        evidence_hash: null,
        rationale_ar: "Reason two",
        final_ruling: "violation",
        detection_pass: "v3_runtime_profanity",
        is_interpretive: false,
        depiction_type: "unknown",
        speaker_role: "unknown",
        narrative_consequence: "unknown",
        context_window_id: null,
        context_confidence: null,
        lexical_confidence: null,
        policy_confidence: null,
        policy_links: [],
        primary_article_id: 5,
        related_article_ids: [5],
      },
    ] as never,
  });

  assert.equal(findings.accepted.length, 2, "V3 stabilization mode should preserve both findings");
  assert.equal(findings.rejected.length, 0, "V3 stabilization mode should not drop the article-4 finding");
}

function main(): void {
  testValidationAndMappingPreserveCandidateMismatchFinding();
  testPersistenceKeepsV3ArticleFour();
  console.log("✓ V3 stabilization mode preserves valid findings through validation, mapping, and persistence");
}

main();
