import { strict as assert } from "node:assert";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { V3ProviderReasoningResult, V3ReasonedDecisionArticleEvaluation } from "./providerTypes.js";
import { validateReasonedDecisionAgainstEvidence } from "./reasonedDecisionValidation.js";

function makePromptInput(): V3PromptBuilderInput {
  return {
    reasoningContract: { title: "Reasoning", stages: [] },
    decisionGraph: { title: "Decision", nodes: [] },
    semanticLayer: { title: "Semantic" },
    storyMemory: "A memory that is present but should not be required.",
    chunkContext: {
      localChunk: "أنت كذاب",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      sceneMemory: "A dialogue scene.",
    },
    subjectModule: {
      id: "v4_11_profanity",
      titleAr: "الألفاظ النابية",
      scope: "Direct profanity analysis only.",
      articleIds: [4, 5, 17],
    },
    glossary: { title: "Glossary", entries: [] },
    outputSchema: { title: "Output", fields: [] },
  } as V3PromptBuilderInput;
}

function makeValidationInput(chunkText: string, articleIds: readonly number[] = [4], atomIds: readonly string[] = ["atom_4_1"]): V3PromptBuilderInput {
  const input = makePromptInput();
  return {
    ...input,
    chunkContext: {
      ...input.chunkContext,
      localChunk: chunkText,
    },
    compiledReviewerContext: makeCandidateAwareCompiledReviewerContext(articleIds, atomIds),
  };
}

function makeCandidateAwareCompiledReviewerContext(articleIds: readonly number[] = [4], atomIds: readonly string[] = ["atom_4_1"]): any {
  return {
    academyRoot: "academy",
    fingerprint: "fingerprint",
    generatedAt: "2026-07-17T00:00:00.000Z",
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
      routingReason: "Candidate aware route.",
      lowConfidence: false,
      reviewerScores: [],
    },
    universalManuals: [],
    selectedReviewerManuals: [],
    rejectedReviewerManuals: [],
    selectedReviewerPackages: [],
    selectedArticles: articleIds.map((articleId) => ({
      articleId: String(articleId),
      reviewer: "Profanity",
      title: "t",
      protectedInterest: "",
      purpose: "",
      neighboringArticles: [],
      atoms: atomIds,
      inherits: [],
      priority: null,
      runtime: null,
      retrieval: null,
      status: null,
      sourcePath: "a",
    })),
    selectedAtoms: atomIds.map((atomId) => ({
      atomId,
      articleId: String(articleIds[0] ?? 4),
      reviewer: "Profanity",
      title: "t",
      protectedInterest: "",
      inherits: [],
      priority: null,
      runtime: null,
      retrieval: null,
      status: null,
      sourcePath: "a",
    })),
    loadedManualCount: 0,
    loadedReviewerCount: 1,
    loadedArticleCount: articleIds.length,
    loadedAtomCount: atomIds.length,
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
      reviewerRoutingReason: "Candidate aware route.",
      reviewerScores: [],
      articleRanking: {
        selectedPolicyArticleIds: [...articleIds],
        selectedPolicyArticleIdsByReviewer: { v4_11_profanity: [...articleIds] },
        rejectedPolicyArticleIds: [],
        candidateArticleCount: articleIds.length,
        candidateArticleScores: [],
      },
      atomRanking: {
        selectedPolicyAtomIds: [...atomIds],
        selectedPolicyAtomIdsByArticle: { [String(articleIds[0] ?? 4)]: [...atomIds] },
        rejectedPolicyAtomIds: [],
        candidateAtomCount: atomIds.length,
        candidateAtomScores: [],
      },
      selectionReason: "Candidate aware route.",
    },
  };
}

function makeReasonedDecisionResult(overrides: Partial<V3ProviderReasoningResult["reasonedDecision"]> & {
  evidenceCandidates?: readonly { text: string; startOffset: number; endOffset: number; confidence?: number }[];
  rawEvidenceText?: string;
  articleEvaluations?: readonly V3ReasonedDecisionArticleEvaluation[];
  reasoning?: string;
  alternativeInterpretations?: readonly string[];
  confidence?: number;
  supportingEvidence?: readonly string[];
  contradictingEvidence?: readonly string[];
  applicableArticles?: readonly number[];
  rejectedArticles?: readonly number[];
  riskAnalysis?: string;
  narrativeAnalysis?: string;
  humanLikeExplanation?: string;
  recommendation?: string;
}): V3ProviderReasoningResult {
  const chunkText = overrides.rawEvidenceText ?? "أنت كذاب";
  const evidenceCandidates = overrides.evidenceCandidates ?? [
    { text: chunkText, startOffset: 0, endOffset: chunkText.length, confidence: 0.98 },
  ];

  return {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: evidenceCandidates.map((candidate) => ({
        text: candidate.text,
        startOffset: candidate.startOffset,
        endOffset: candidate.endOffset,
        confidence: candidate.confidence ?? 0.98,
        source: "chunk" as const,
        notes: [],
      })),
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: chunkText,
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: overrides.reasoning ?? chunkText,
      alternativeInterpretations: overrides.alternativeInterpretations ?? ["Could be literal dialogue."],
      confidence: overrides.confidence ?? 0.93,
      articleEvaluations: overrides.articleEvaluations ?? [
        {
          articleId: 4,
          status: "PASS",
          evidence: [chunkText],
          reason: chunkText,
          confidence: 0.93,
        },
      ],
      supportingEvidence: overrides.supportingEvidence ?? [chunkText],
      contradictingEvidence: overrides.contradictingEvidence ?? [],
      applicableArticles: overrides.applicableArticles ?? [4],
      rejectedArticles: overrides.rejectedArticles ?? [],
      riskAnalysis: overrides.riskAnalysis ?? chunkText,
      narrativeAnalysis: overrides.narrativeAnalysis ?? chunkText,
      humanLikeExplanation: overrides.humanLikeExplanation ?? chunkText,
      recommendation: overrides.recommendation ?? "RETURN VIOLATION",
    },
  };
}

function main(): void {
  const input = makePromptInput();
  const validation = validateReasonedDecisionAgainstEvidence(input, {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "أنت كذاب",
          startOffset: 0,
          endOffset: 8,
          confidence: 0.98,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "أنت كذاب",
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "The quote is enough to know that a prince was murdered in the palace.",
      alternativeInterpretations: ["Could be metaphorical."],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 4, status: "PASS", evidence: ["أنت كذاب"], reason: "The quote supports the conclusion.", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "Direct dialogue.",
      humanLikeExplanation: "A human reviewer would not invent a prince or murder from this quote.",
      recommendation: "RETURN VIOLATION",
    },
  });

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.length > 0, true);
  assert.equal(validation.issues.some((issue) => issue.code === "unsupported_factual_claim"), true);
  assert.equal(validation.sanitizedDecision.reasoning, "أنت كذاب");
  assert.equal(validation.sanitizedDecision.humanLikeExplanation, "أنت كذاب");
  assert.equal(validation.sanitizedDecision.articleEvaluations.length, 1);
  console.log("✓ reasoned decision grounding validator rejects hallucinated explanations");

  testCandidateAwareValidation();
  console.log("✓ reasoned decision grounding validator accepts deterministic candidate references");

  testCanonicalFallbackUsesSelectedArticleIds();
  console.log("✓ reasoned decision grounding validator accepts canonical selected article ids");

  testArabicNarrativeGrounding();
  console.log("✓ reasoned decision grounding validator accepts grounded Arabic explanation");

  testEllipsisNormalization();
  testWhitespaceNormalization();
  testArabicPunctuationNormalization();
  testPartialSpanAcceptance();
  testMixedValidAndInvalidEvidence();
  testOnlyOneOfMultipleEvidenceItemsFails();
  testExactQuotedDialogueIsAccepted();
  testEvidenceFirstExplanationRegeneration();
}

function testCandidateAwareValidation(): void {
  const input = makePromptInput();
  const compiledReviewerContext: any = {
    academyRoot: "academy",
    fingerprint: "fingerprint",
    generatedAt: "2026-07-17T00:00:00.000Z",
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
      routingReason: "Candidate aware route.",
      lowConfidence: false,
      reviewerScores: [],
    },
    universalManuals: [],
    selectedReviewerManuals: [],
    rejectedReviewerManuals: [],
    selectedReviewerPackages: [],
    selectedArticles: [{ articleId: "4", reviewer: "Profanity", title: "t", protectedInterest: "", purpose: "", neighboringArticles: [], atoms: ["atom_4_1"], inherits: [], priority: null, runtime: null, retrieval: null, status: null, sourcePath: "a" }],
    selectedAtoms: [{ atomId: "atom_4_1", articleId: "4", reviewer: "Profanity", title: "t", protectedInterest: "", inherits: [], priority: null, runtime: null, retrieval: null, status: null, sourcePath: "a" }],
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
      reviewerRoutingReason: "Candidate aware route.",
      reviewerScores: [],
      articleRanking: {
        selectedPolicyArticleIds: [4],
        selectedPolicyArticleIdsByReviewer: { v4_11_profanity: [4] },
        rejectedPolicyArticleIds: [],
        candidateArticleCount: 1,
        candidateArticleScores: [],
      },
      atomRanking: {
        selectedPolicyAtomIds: ["atom_4_1"],
        selectedPolicyAtomIdsByArticle: { "4": ["atom_4_1"] },
        rejectedPolicyAtomIds: [],
        candidateAtomCount: 1,
        candidateAtomScores: [],
      },
      selectionReason: "Candidate aware route.",
    },
  };
  (input as any).compiledReviewerContext = compiledReviewerContext;

  const validation = validateReasonedDecisionAgainstEvidence(input, {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "أنت كذاب",
          startOffset: 0,
          endOffset: 8,
          confidence: 0.98,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "أنت كذاب",
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "أنت كذاب",
      alternativeInterpretations: ["Could be literal dialogue."],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 4, status: "PASS", evidence: ["أنت كذاب"], reason: "The quote supports the conclusion.", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "أنت كذاب",
      humanLikeExplanation: "أنت كذاب",
      recommendation: "RETURN VIOLATION",
    },
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
}

function testCanonicalFallbackUsesSelectedArticleIds(): void {
  const input = makePromptInput();
  const compiledReviewerContext: any = {
    academyRoot: "academy",
    fingerprint: "fingerprint",
    generatedAt: "2026-07-17T00:00:00.000Z",
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
      routingReason: "Candidate aware route.",
      lowConfidence: false,
      reviewerScores: [],
    },
    universalManuals: [],
    selectedReviewerManuals: [],
    rejectedReviewerManuals: [],
    selectedReviewerPackages: [],
    selectedArticles: [
      {
        articleId: "article_11",
        reviewer: "Religion",
        title: "Article 11",
        protectedInterest: "",
        purpose: "",
        neighboringArticles: [],
        atoms: ["atom_11_1"],
        inherits: [],
        priority: null,
        runtime: null,
        retrieval: null,
        status: null,
        sourcePath: "a",
      },
    ],
    selectedAtoms: [],
    loadedManualCount: 0,
    loadedReviewerCount: 1,
    loadedArticleCount: 1,
    loadedAtomCount: 0,
    loadedCharacterCount: 0,
    estimatedTokenCount: 1,
    promptCharacterCount: 0,
    promptTokenEstimate: 1,
    promptPreview: "",
    candidateDiagnostics: null,
  };
  (input as any).compiledReviewerContext = compiledReviewerContext;

  const validation = validateReasonedDecisionAgainstEvidence(input, {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "أنت كذاب",
          startOffset: 0,
          endOffset: 8,
          confidence: 0.98,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "أنت كذاب",
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "أنت كذاب",
      alternativeInterpretations: ["Could be literal dialogue."],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 11, status: "PASS", evidence: ["أنت كذاب"], reason: "The quote supports the conclusion.", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [11],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "أنت كذاب",
      humanLikeExplanation: "أنت كذاب",
      recommendation: "RETURN VIOLATION",
    },
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
}

function testArabicNarrativeGrounding(): void {
  const input = makePromptInput();
  const compiledReviewerContext: any = {
    academyRoot: "academy",
    fingerprint: "fingerprint",
    generatedAt: "2026-07-17T00:00:00.000Z",
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
      routingReason: "Candidate aware route.",
      lowConfidence: false,
      reviewerScores: [],
    },
    universalManuals: [],
    selectedReviewerManuals: [],
    rejectedReviewerManuals: [],
    selectedReviewerPackages: [],
    selectedArticles: [{ articleId: "4", reviewer: "Profanity", title: "t", protectedInterest: "", purpose: "", neighboringArticles: [], atoms: ["atom_4_1"], inherits: [], priority: null, runtime: null, retrieval: null, status: null, sourcePath: "a" }],
    selectedAtoms: [{ atomId: "atom_4_1", articleId: "4", reviewer: "Profanity", title: "t", protectedInterest: "", inherits: [], priority: null, runtime: null, retrieval: null, status: null, sourcePath: "a" }],
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
      reviewerRoutingReason: "Candidate aware route.",
      reviewerScores: [],
      articleRanking: {
        selectedPolicyArticleIds: [4],
        selectedPolicyArticleIdsByReviewer: { v4_11_profanity: [4] },
        rejectedPolicyArticleIds: [],
        candidateArticleCount: 1,
        candidateArticleScores: [],
      },
      atomRanking: {
        selectedPolicyAtomIds: ["atom_4_1"],
        selectedPolicyAtomIdsByArticle: { "4": ["atom_4_1"] },
        rejectedPolicyAtomIds: [],
        candidateAtomCount: 1,
        candidateAtomScores: [],
      },
      selectionReason: "Candidate aware route.",
    },
  };
  (input as any).compiledReviewerContext = compiledReviewerContext;

  const validation = validateReasonedDecisionAgainstEvidence(input, {
    prompt: "prompt",
    promptHash: "hash",
    userPrompt: "user prompt",
    rawResponse: {
      providerName: "openai",
      modelName: "test-model",
      modelVersion: null,
      rawResponse: "{}",
      finishReason: "stop",
      usage: null,
      responseId: null,
      responseTimestamp: null,
    },
    narrative: {
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      narrativeVoice: "dialogue",
      sceneType: "dialogue",
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
      confidence: 0.9,
      notes: [],
    },
    evidence: {
      candidates: [
        {
          text: "أنت كذاب",
          startOffset: 0,
          endOffset: 8,
          confidence: 0.98,
          source: "chunk",
          notes: [],
        },
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.98,
      notes: [],
    },
    semantic: {
      semanticMeaning: "direct insult",
      narrativeIntent: "attack",
      conversationRole: "speaker",
      sceneRole: "dialogue",
      speaker: "speaker",
      listener: "listener",
      target: "listener",
      victim: "listener",
      emotion: "hostile",
      riskContext: "high",
      confidence: 0.93,
      notes: [],
    },
    context: {
      storyMemory: null,
      sceneMemory: null,
      localContext: "أنت كذاب",
      chunkContext: "chunk-1",
      neighboringSentences: ["قبلها كان صمت.", "بعدها غادروا."],
      narrativeContext: "dialogue scene",
      confidence: 0.9,
      notes: [],
    },
    reasonedDecision: {
      reasoning: "أنت كذاب",
      alternativeInterpretations: ["أنت كذاب"],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 4, status: "PASS", evidence: ["أنت كذاب"], reason: "أنت كذاب", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "أنت كذاب",
      humanLikeExplanation: "أنت كذاب",
      recommendation: "RETURN VIOLATION",
    },
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
}

function testEllipsisNormalization(): void {
  const chunkText = "يا… كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["يا... كذاب"],
        reason: "يا... كذاب",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["يا... كذاب"],
    reasoning: "يا… كذاب",
    humanLikeExplanation: "يا… كذاب",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations.length, 1);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], "يا... كذاب");
  console.log("✓ ellipsis normalization accepts grounded evidence");
}

function testWhitespaceNormalization(): void {
  const chunkText = "أنت كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["أنت    كذاب"],
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["أنت    كذاب"],
    reasoning: "The quote directly supports the conclusion.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], "أنت كذاب");
  console.log("✓ whitespace normalization accepts grounded evidence");
}

function testArabicPunctuationNormalization(): void {
  const chunkText = "أنت كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["أنت، كذاب"],
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["أنت، كذاب"],
    reasoning: "The quote directly supports the conclusion.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], "أنت، كذاب");
  console.log("✓ Arabic punctuation normalization accepts grounded evidence");
}

function testPartialSpanAcceptance(): void {
  const chunkText = "أنت كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["كذاب"],
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["كذاب"],
    reasoning: "The quote directly supports the conclusion.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], "كذاب");
  console.log("✓ partial span acceptance preserves grounded evidence");
}

function testMixedValidAndInvalidEvidence(): void {
  const chunkText = "أنت كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["أنت كذاب", "تفاصيل مختلقة عن الأمير في القصر"],
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["أنت كذاب", "تفاصيل مختلقة عن الأمير في القصر"],
    reasoning: "The quote directly supports the conclusion.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.some((issue) => issue.code === "unsupported_supporting_evidence"), true);
  assert.equal(validation.sanitizedDecision.articleEvaluations.length, 1);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence.length, 1);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], "أنت كذاب");
  console.log("✓ mixed valid/invalid evidence preserves the valid item");
}

function testOnlyOneOfMultipleEvidenceItemsFails(): void {
  const chunkText = "أنت كذاب";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: ["أنت كذاب", "أنت، كذاب", "القصر المزعوم"],
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["أنت كذاب", "أنت، كذاب", "القصر المزعوم"],
    reasoning: "The quote directly supports the conclusion.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.filter((issue) => issue.code === "unsupported_supporting_evidence").length >= 1, true);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence.length, 2);
  assert.deepEqual(validation.sanitizedDecision.articleEvaluations[0].evidence, ["أنت كذاب", "أنت، كذاب"]);
  console.log("✓ one failed evidence item does not invalidate the whole evaluation");
}

function testExactQuotedDialogueIsAccepted(): void {
  const chunkText = "حاضر. فهد يتمتم بشتائم: يا… موتو و خلصوني منكم";
  const input = makeValidationInput(chunkText);
  const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
    rawEvidenceText: chunkText,
    evidenceCandidates: [{ text: chunkText, startOffset: 0, endOffset: chunkText.length }],
    articleEvaluations: [
      {
        articleId: 4,
        status: "PASS",
        evidence: [chunkText],
        reason: chunkText,
        confidence: 0.97,
      },
    ],
    supportingEvidence: [chunkText],
    reasoning: chunkText,
    humanLikeExplanation: chunkText,
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], chunkText);
  console.log("✓ exact quoted dialogue is accepted");
}

function testEvidenceFirstExplanationRegeneration(): void {
  const cases = [
    {
      title: "profanity evidence never produces child-abuse explanation",
      chunkText: "أنت كذاب",
      invalidExplanation: "الطفل يتعرض للعنف في مشهد آخر.",
      forbiddenTokens: ["الطفل", "العنف", "مشهد آخر"],
    },
    {
      title: "child-abuse evidence never produces profanity explanation",
      chunkText: "الطفل يبكي",
      invalidExplanation: "يا كلب، هذا مجرد وصف آخر.",
      forbiddenTokens: ["يا كلب"],
    },
    {
      title: "religion explanation cannot appear unless evidence contains religion",
      chunkText: "أنت كذاب",
      invalidExplanation: "هذا متعلق بالدين والرسول في مشهد آخر.",
      forbiddenTokens: ["الدين", "الرسول", "مشهد آخر"],
    },
    {
      title: "security explanation cannot appear unless evidence contains security",
      chunkText: "أنت كذاب",
      invalidExplanation: "هذا تهديد أمني يتعلق بالجيش والشرطة.",
      forbiddenTokens: ["الجيش", "الشرطة", "تهديد أمني"],
    },
    {
      title: "explanation cannot mention characters absent from evidence",
      chunkText: "أنت كذاب",
      invalidExplanation: "Character A threatens Character B in the previous scene.",
      forbiddenTokens: ["Character A", "Character B", "previous scene"],
    },
    {
      title: "explanation cannot reference another scene",
      chunkText: "أنت كذاب",
      invalidExplanation: "In the previous scene the same insult appears again.",
      forbiddenTokens: ["previous scene", "same insult appears again"],
    },
  ] as const;

  for (const testCase of cases) {
    const input = makeValidationInput(testCase.chunkText);
    const validation = validateReasonedDecisionAgainstEvidence(input, makeReasonedDecisionResult({
      rawEvidenceText: testCase.chunkText,
      evidenceCandidates: [{ text: testCase.chunkText, startOffset: 0, endOffset: testCase.chunkText.length }],
      humanLikeExplanation: testCase.invalidExplanation,
      reasoning: testCase.invalidExplanation,
      narrativeAnalysis: testCase.invalidExplanation,
    }));

    assert.equal(validation.valid, true, testCase.title);
    assert.equal(validation.issues.some((issue) => issue.code === "unsupported_explanation"), true, testCase.title);
    assert.equal(validation.sanitizedDecision.humanLikeExplanation.includes(testCase.chunkText), true, testCase.title);
    for (const forbiddenToken of testCase.forbiddenTokens) {
      assert.equal(validation.sanitizedDecision.humanLikeExplanation.includes(forbiddenToken), false, `${testCase.title}: ${forbiddenToken}`);
      assert.equal(validation.sanitizedDecision.reasoning.includes(forbiddenToken), false, `${testCase.title}: ${forbiddenToken} reasoning`);
      assert.equal(validation.sanitizedDecision.narrativeAnalysis.includes(forbiddenToken), false, `${testCase.title}: ${forbiddenToken} narrative`);
    }
  }

  console.log("✓ explanation consistency validator regenerates unsafe explanations");
}

main();
