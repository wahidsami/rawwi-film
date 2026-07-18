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
      reasoning: overrides.reasoning ?? "The quote directly supports the conclusion.",
      alternativeInterpretations: overrides.alternativeInterpretations ?? ["Could be literal dialogue."],
      confidence: overrides.confidence ?? 0.93,
      articleEvaluations: overrides.articleEvaluations ?? [
        {
          articleId: 4,
          status: "PASS",
          evidence: [chunkText],
          reason: "The quote supports the conclusion.",
          confidence: 0.93,
        },
      ],
      supportingEvidence: overrides.supportingEvidence ?? [chunkText],
      contradictingEvidence: overrides.contradictingEvidence ?? [],
      applicableArticles: overrides.applicableArticles ?? [4],
      rejectedArticles: overrides.rejectedArticles ?? [],
      riskAnalysis: overrides.riskAnalysis ?? "Low risk.",
      narrativeAnalysis: overrides.narrativeAnalysis ?? "Direct dialogue.",
      humanLikeExplanation: overrides.humanLikeExplanation ?? "A human reviewer would likely accept this as grounded.",
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
  assert.equal(validation.sanitizedDecision.reasoning, "The quote is enough to know that a prince was murdered in the palace.");
  assert.equal(validation.sanitizedDecision.articleEvaluations.length, 1);
  console.log("✓ reasoned decision grounding validator rejects hallucinated explanations");

  testCandidateAwareValidation();
  console.log("✓ reasoned decision grounding validator accepts deterministic candidate references");

  testArabicNarrativeGrounding();
  console.log("✓ reasoned decision grounding validator accepts grounded Arabic explanation");

  testEllipsisNormalization();
  testWhitespaceNormalization();
  testArabicPunctuationNormalization();
  testPartialSpanAcceptance();
  testMixedValidAndInvalidEvidence();
  testOnlyOneOfMultipleEvidenceItemsFails();
  testExactQuotedDialogueIsAccepted();
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
      reasoning: "Candidate article 4 and atom_4_1 are supported by the quote.",
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
      narrativeAnalysis: "Direct dialogue.",
      humanLikeExplanation: "The returned article and atom are inside the deterministic candidate set.",
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
      reasoning: "النص يحتوي حواراً مباشرًا، وإدانة واضحة، ويصف الزوجة داخل سياق عائلي مرتبط بالعنف، لكن الحكم النهائي يستند إلى العبارة المنقولة نفسها.",
      alternativeInterpretations: ["قد يكون مجرد حوار عائلي لا أكثر."],
      confidence: 0.93,
      articleEvaluations: [
        { articleId: 4, status: "PASS", evidence: ["أنت كذاب"], reason: "العبارة المنقولة هي الأساس، ولا أضيف وقائع جديدة.", confidence: 0.93 },
      ],
      supportingEvidence: ["أنت كذاب"],
      contradictingEvidence: [],
      applicableArticles: [4],
      rejectedArticles: [],
      riskAnalysis: "Low risk.",
      narrativeAnalysis: "وصف حواري عائلي.",
      humanLikeExplanation: "التفسير عربي وصفي لكنه لا يضيف وقائع خارج الاقتباس.",
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
        reason: "The quote directly supports the conclusion.",
        confidence: 0.93,
      },
    ],
    supportingEvidence: ["يا... كذاب"],
    reasoning: "The quote directly supports the conclusion.",
    humanLikeExplanation: "The evidence is copied from the screenplay with ellipsis normalization.",
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
        reason: "The exact quote directly supports the conclusion.",
        confidence: 0.97,
      },
    ],
    supportingEvidence: [chunkText],
    reasoning: "The exact quote directly supports the conclusion.",
    humanLikeExplanation: "The screenplay dialogue is copied exactly.",
  }));

  assert.equal(validation.valid, true);
  assert.equal(validation.issues.length, 0);
  assert.equal(validation.sanitizedDecision.articleEvaluations[0].evidence[0], chunkText);
  console.log("✓ exact quoted dialogue is accepted");
}

main();
