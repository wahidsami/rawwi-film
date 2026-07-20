import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { ReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import type { V3ReasonedDecisionResult } from "../provider/providerTypes.js";
import type {
  ReviewerDecisionArticleEvaluation,
  ReviewerDecisionContext,
  ReviewerDecisionKnowledgeAssets,
  ReviewerDecisionPreliminaryDecision,
  ReviewerDecisionReasoning,
  ReviewerDecisionReasoningStage,
} from "./reviewerDecisionTypes.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";

export type ReviewerDecisionPreparationInput = Readonly<{
  intelligence: IntelligenceContext;
  reviewerReasoningEngine?: ReviewerReasoningEnginePayload | null;
  reviewerAssessment?: ReviewerAssessment | null;
  conceptContext?: ConceptContext | null;
  reasonedDecision?: V3ReasonedDecisionResult | null;
  subjectModuleArticleIds?: readonly number[] | null;
}>;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)),
  );
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return normalizeText(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeArticleStatus(value: unknown): ReviewerDecisionArticleEvaluation["status"] {
  return String(value ?? "").toUpperCase() === "PASS" ? "PASS" : "FAIL";
}

function normalizeArticleEvidence(values: readonly unknown[] | undefined): readonly string[] {
  return Object.freeze(
    [...new Set((values ?? []).map((value) => normalizeText(String(value))).filter((value) => value.length > 0))],
  );
}

function collectEvidenceTexts(candidates: readonly { readonly text: string }[]): readonly string[] {
  return uniqueStrings(candidates.map((candidate) => candidate.text));
}

function selectGroundedEvidenceText(input: ReviewerDecisionPreparationInput): string {
  const primary = input.intelligence.evidence.candidates[input.intelligence.evidence.primaryCandidateIndex ?? 0] ?? input.intelligence.evidence.candidates[0] ?? null;
  return normalizeText(
    primary?.text ??
      input.intelligence.evidence.candidates[0]?.text ??
      input.intelligence.context.localContext ??
      "",
  );
}

function objectArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null) as readonly Record<string, unknown>[]) : [];
}

function collectKnowledgeAssets(
  reviewerReasoningEngine: ReviewerReasoningEnginePayload | null | undefined,
  reviewerAssessment: ReviewerAssessment | null | undefined,
): ReviewerDecisionKnowledgeAssets {
  const lessons = objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.lessons).flatMap((entry) => [
    stringValue(entry.id),
    stringValue(entry.title),
  ]);
  const decisionRecords = objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.decision_records).flatMap((entry) => [
    stringValue(entry.id),
    stringValue(entry.title),
  ]);
  const patternLibraries = objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.patterns).flatMap((entry) => [
    stringValue(entry.id),
    stringValue(entry.title),
  ]);
  const benchmarks = objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.lessons).flatMap((entry) => {
    const lessonBenchmarks = Array.isArray(entry.benchmark_references) ? entry.benchmark_references : [];
    return lessonBenchmarks.map((benchmark) => stringValue(benchmark));
  });
  const reviewerKnowledge = objectArray(((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.knowledge as Record<string, unknown> | undefined)?.selected_packs).flatMap((entry) => [
    stringValue(entry.id),
    stringValue(entry.title),
  ]);
  const gcamMappings = [
    ...objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.lessons).flatMap((entry) => {
      const mappings = objectArray(entry.gcam_mappings);
      return mappings.flatMap((mapping) => [
        stringValue(mapping.article_id),
        stringValue(mapping.atom_id),
        stringValue(mapping.role),
      ]);
    }),
    ...objectArray(((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.knowledge as Record<string, unknown> | undefined)?.selected_packs).flatMap((entry) => {
      const mappings = objectArray(entry.article_mapping);
      return mappings.flatMap((mapping) => [
        stringValue(mapping.article_id),
        ...objectArray(mapping.atom_ids).map((atom) => stringValue(atom)),
      ]);
    }),
  ];

  const narrativeReasoning = uniqueStrings([
    ...(reviewerAssessment?.reasoningTrace ?? []),
    reviewerAssessment?.narrativeUnderstanding ?? "",
    reviewerAssessment?.contextClassification ?? "",
    reviewerAssessment?.literalVsImpliedMeaning ?? "",
  ]);

  const intentReasoning = uniqueStrings([
    reviewerAssessment?.narrativeIntent ?? "",
    reviewerAssessment?.speaker ?? "",
    reviewerAssessment?.target ?? "",
    reviewerAssessment?.victim ?? "",
    reviewerAssessment?.exceptionSignals?.join(" | ") ?? "",
  ]);

  const relationshipReasoning = uniqueStrings([
    ...objectArray((reviewerReasoningEngine as Record<string, unknown> | null | undefined)?.relationships).flatMap((entry) => [
      stringValue(entry.term),
      stringValue(entry.relation),
      stringValue(entry.note),
      stringValue(entry.source),
    ]),
  ]);

  return Object.freeze({
    lessons: uniqueStrings(lessons),
    decisionRecords: uniqueStrings(decisionRecords),
    patternLibraries: uniqueStrings(patternLibraries),
    benchmarks: uniqueStrings(benchmarks),
    reviewerKnowledge: uniqueStrings(reviewerKnowledge),
    gcamMappings: uniqueStrings(gcamMappings),
    narrativeReasoning,
    intentReasoning,
    relationshipReasoning,
  });
}

function buildArticleEvaluations(
  input: ReviewerDecisionPreparationInput,
  applicableArticles: readonly number[],
  rejectedArticles: readonly number[],
): readonly ReviewerDecisionArticleEvaluation[] {
  const explicitEvaluations = Array.isArray(input.reasonedDecision?.articleEvaluations)
    ? input.reasonedDecision.articleEvaluations
    : [];

  if (explicitEvaluations.length > 0) {
    return Object.freeze(
      explicitEvaluations
        .map((evaluation) => Object.freeze({
          articleId: Number.isFinite(Number(evaluation.articleId)) ? Number(evaluation.articleId) : 0,
          status: normalizeArticleStatus(evaluation.status),
          evidence: normalizeArticleEvidence(evaluation.evidence),
          reason: normalizeText(evaluation.reason),
          confidence: clampConfidence(evaluation.confidence),
        }))
        .filter((evaluation) => evaluation.articleId > 0),
    );
  }

  const passSet = new Set(applicableArticles);
  const failSet = new Set(rejectedArticles);
  const subjectArticleIds = [...new Set(input.subjectModuleArticleIds ?? [])].sort((left, right) => left - right);
  const sourceArticleIds = subjectArticleIds.length > 0 ? subjectArticleIds : [...new Set([...passSet, ...failSet])].sort((left, right) => left - right);
  const groundedEvidence = selectGroundedEvidenceText(input);
  const sharedEvidence = normalizeArticleEvidence([
    ...(input.reasonedDecision?.supportingEvidence ?? []),
    groundedEvidence,
  ]);

  return Object.freeze(sourceArticleIds.map((articleId) => Object.freeze({
    articleId,
    status: passSet.has(articleId) ? "PASS" : "FAIL",
    evidence: sharedEvidence,
    reason: passSet.has(articleId)
      ? "Quote-based evidence supports this article."
      : "Quote-based evidence does not support this article.",
    confidence: clampConfidence(
      input.reasonedDecision?.confidence ??
      input.reviewerAssessment?.confidence ??
      input.intelligence.evidence.confidence ??
      input.intelligence.semantic.confidence,
    ),
  })));
}

function buildPreliminaryDecision(
  input: ReviewerDecisionPreparationInput,
  applicableArticles: readonly number[],
  rejectedArticles: readonly number[],
  articleEvaluations: readonly ReviewerDecisionArticleEvaluation[],
): ReviewerDecisionPreliminaryDecision {
  const confidence = clampConfidence(
    input.reasonedDecision?.confidence ??
      input.reviewerAssessment?.confidence ??
      input.intelligence.evidence.confidence ??
      input.intelligence.semantic.confidence,
  );

  const evidenceCount = input.intelligence.evidence.candidates.length;
  const exceptionHeavy = input.intelligence.flags.quotation || input.intelligence.flags.educational || input.intelligence.flags.condemnation;
  const narrativeSupport = input.intelligence.flags.promotion || input.intelligence.flags.neutrality || input.intelligence.flags.description;
  const passArticles = articleEvaluations.filter((evaluation) => evaluation.status === "PASS").map((evaluation) => evaluation.articleId);
  const failArticles = articleEvaluations.filter((evaluation) => evaluation.status === "FAIL").map((evaluation) => evaluation.articleId);

  const status = passArticles.length === 0
    ? "reject"
    : evidenceCount === 0 || confidence < 0.45
      ? "reject"
    : exceptionHeavy
      ? "needs_review"
      : narrativeSupport && confidence >= 0.65
        ? "accept"
        : confidence >= 0.55
          ? "needs_review"
          : "reject";

  const reason = uniqueStrings([
    input.reasonedDecision?.reasoning ?? "",
    input.reasonedDecision?.narrativeAnalysis ?? "",
    input.reasonedDecision?.riskAnalysis ?? "",
    input.reviewerAssessment?.narrativeUnderstanding ?? "",
    input.reviewerAssessment?.literalVsImpliedMeaning ?? "",
    passArticles.length > 0 ? `PASS articles: ${passArticles.join(", ")}.` : "NO VIOLATION.",
    exceptionHeavy ? "Exception-heavy context requires caution." : "",
    evidenceCount > 0 ? `Evidence candidates: ${evidenceCount}.` : "No semantic evidence candidates were provided.",
  ]).join(" | ");

  return Object.freeze({
    status,
    reason,
    confidence,
    applicableArticles: Object.freeze(passArticles.length > 0 ? [...new Set(passArticles)].sort((left, right) => left - right) : []),
    rejectedArticles: Object.freeze([...new Set(failArticles.length > 0 ? failArticles : rejectedArticles)].sort((left, right) => left - right)),
  });
}

function buildReasoningStages(
  input: ReviewerDecisionPreparationInput,
  knowledgeAssets: ReviewerDecisionKnowledgeAssets,
  preliminaryDecision: ReviewerDecisionPreliminaryDecision,
): readonly ReviewerDecisionReasoningStage[] {
  const groundedEvidence = selectGroundedEvidenceText(input);
  const literalMeaning = normalizeText(
    groundedEvidence ||
      input.intelligence.semantic.semanticMeaning ||
      input.intelligence.context.localContext,
  );
  const impliedMeaning = normalizeText(
    input.reasonedDecision?.reasoning ??
      input.reasonedDecision?.narrativeAnalysis ??
      input.reviewerAssessment?.literalVsImpliedMeaning ??
      input.intelligence.semantic.riskContext ??
      "No implied meaning could be determined.",
  );
  const narrativeContext = normalizeText(input.intelligence.context.narrativeContext || input.reviewerAssessment?.narrativeUnderstanding || "No narrative context available.");
  const speakerAnalysis = normalizeText([
    `speaker=${input.intelligence.speaker ?? "unknown"}`,
    `listener=${input.intelligence.listener ?? "unknown"}`,
    `target=${input.intelligence.target ?? "unknown"}`,
  ].join(" | "));
  const victimAnalysis = normalizeText([
    `victim=${input.intelligence.victim ?? "unknown"}`,
    `sceneType=${input.intelligence.sceneType}`,
  ].join(" | "));
  const socialImpact = normalizeText([
    input.intelligence.flags.condemnation ? "condemned" : "",
    input.intelligence.flags.promotion ? "promotional" : "",
    input.intelligence.flags.educational ? "educational" : "",
    input.intelligence.flags.quotation ? "quoted" : "",
    input.intelligence.flags.neutrality ? "neutral" : "",
  ].filter(Boolean).join(", ") || "context-sensitive");

  const supportingEvidence = uniqueStrings([
    ...(input.reasonedDecision?.supportingEvidence ?? []),
    groundedEvidence,
    literalMeaning,
  ]);
  const counterEvidence = uniqueStrings([
    ...(input.reasonedDecision?.contradictingEvidence ?? []),
    ...(input.intelligence.evidence.notes ?? []),
    input.intelligence.flags.quotation ? "Quoted speech may change the reading." : "",
    input.intelligence.flags.educational ? "Educational framing may reduce severity." : "",
    input.intelligence.flags.condemnation ? "Condemnation may negate endorsement." : "",
    ...(input.reviewerAssessment?.stageResults?.filter((stage) => stage.status !== "complete").map((stage) => stage.summary) ?? []),
  ]);

  const knowledgeSummary = uniqueStrings([
    ...knowledgeAssets.lessons.slice(0, 3),
    ...knowledgeAssets.patternLibraries.slice(0, 3),
    ...knowledgeAssets.reviewerKnowledge.slice(0, 3),
  ]);
  const precedentSummary = uniqueStrings([
    ...knowledgeAssets.decisionRecords.slice(0, 3),
    ...(input.reasonedDecision?.applicableArticles ?? []).map((articleId) => `article:${articleId}`),
  ]);

  const stages: ReviewerDecisionReasoningStage[] = [
    {
      key: "literal_meaning",
      title: "Literal Meaning",
      purpose: "Understand the explicit wording before interpretation.",
      summary: literalMeaning || "No literal meaning could be extracted.",
      confidence: clampConfidence(input.intelligence.semantic.confidence),
      inputs: ["semantic", "evidence"],
      outputs: ["literal_meaning"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "implied_meaning",
      title: "Implied Meaning",
      purpose: "Infer the implied meaning and hidden reading.",
      summary: impliedMeaning || "No implied meaning could be determined.",
      confidence: clampConfidence(Math.min(input.intelligence.semantic.confidence, input.intelligence.context.confidence)),
      inputs: ["semantic", "context", "reasoned_decision"],
      outputs: ["implied_meaning"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "speaker_analysis",
      title: "Speaker Analysis",
      purpose: "Determine who is speaking and how that affects the reading.",
      summary: speakerAnalysis,
      confidence: clampConfidence(input.intelligence.narrative.confidence),
      inputs: ["narrative", "semantic"],
      outputs: ["speaker_analysis"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "target_analysis",
      title: "Target Analysis",
      purpose: "Determine who or what the statement is directed at.",
      summary: victimAnalysis,
      confidence: clampConfidence(input.intelligence.semantic.confidence),
      inputs: ["narrative", "semantic", "context"],
      outputs: ["target_analysis"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "intent_analysis",
      title: "Intent Analysis",
      purpose: "Determine whether the text condemns, glorifies, or neutrally presents the content.",
      summary: normalizeText([
        input.intelligence.flags.condemnation ? "condemns" : "",
        input.intelligence.flags.promotion ? "promotes" : "",
        input.intelligence.flags.educational ? "educational" : "",
        input.intelligence.flags.neutrality ? "neutral" : "",
      ].filter(Boolean).join(", ") || "intent unknown"),
      confidence: clampConfidence(Math.max(input.intelligence.narrative.confidence, input.intelligence.semantic.confidence)),
      inputs: ["semantic", "narrative", "flags"],
      outputs: ["intent_analysis"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "narrative_purpose",
      title: "Narrative Purpose",
      purpose: "Establish the narrative role of the statement in the screenplay.",
      summary: narrativeContext,
      confidence: clampConfidence(input.intelligence.context.confidence),
      inputs: ["context", "story_memory", "scene_memory"],
      outputs: ["narrative_purpose"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "context_positioning",
      title: "Context Positioning",
      purpose: "Decide whether context supports condemnation, glorification, or a neutral reading.",
      summary: socialImpact,
      confidence: clampConfidence(input.intelligence.context.confidence),
      inputs: ["flags", "narrative", "context"],
      outputs: ["context_positioning"],
      evidence: supportingEvidence,
      knowledge: knowledgeSummary,
    },
    {
      key: "knowledge_retrieval",
      title: "Reviewer Knowledge Retrieval",
      purpose: "Retrieve the reviewer knowledge needed for the case.",
      summary: knowledgeAssets.reviewerKnowledge.length > 0
        ? `Loaded ${knowledgeAssets.reviewerKnowledge.length} reviewer knowledge assets.`
        : "No reviewer knowledge assets were selected.",
      confidence: clampConfidence(preliminaryDecision.confidence),
      inputs: ["knowledge_assets", "packs"],
      outputs: ["knowledge_retrieval"],
      evidence: supportingEvidence,
      knowledge: knowledgeAssets.reviewerKnowledge,
    },
    {
      key: "precedent_retrieval",
      title: "Precedent Retrieval",
      purpose: "Retrieve similar decisions and precedent cases.",
      summary: precedentSummary.length > 0
        ? `Matched precedents: ${precedentSummary.join(", ")}`
        : "No precedent matches were selected.",
      confidence: clampConfidence(preliminaryDecision.confidence),
      inputs: ["decision_records", "cases", "precedents"],
      outputs: ["precedent_retrieval"],
      evidence: supportingEvidence,
      knowledge: knowledgeAssets.decisionRecords,
    },
    {
      key: "gcam_applicability",
      title: "GCAM Applicability",
      purpose: "Evaluate each GCAM article independently using quote-based evidence only.",
      summary: preliminaryDecision.applicableArticles.length > 0
        ? `PASS articles: ${preliminaryDecision.applicableArticles.join(", ")} | FAIL articles: ${preliminaryDecision.rejectedArticles.join(", ") || "none"}`
        : "NO VIOLATION | all evaluated articles failed.",
      confidence: preliminaryDecision.confidence,
      inputs: ["knowledge", "precedents", "context"],
      outputs: ["gcam_applicability"],
      evidence: supportingEvidence,
      knowledge: knowledgeAssets.gcamMappings,
    },
    {
      key: "reasoning_generation",
      title: "Reasoning Generation",
      purpose: "Assemble the reviewer explanation and counterargument.",
      summary: normalizeText(
        input.reasonedDecision?.reasoning ??
          input.reasonedDecision?.humanLikeExplanation ??
          "The reviewer synthesizes evidence, knowledge, and context into a reasoned package.",
      ),
      confidence: preliminaryDecision.confidence,
      inputs: ["literal_meaning", "implied_meaning", "knowledge", "precedents", "gcam"],
      outputs: ["reasoning_package"],
      evidence: supportingEvidence,
      knowledge: knowledgeAssets.lessons,
    },
    {
      key: "preliminary_decision",
      title: "Preliminary Decision",
      purpose: "Generate a preliminary reviewer decision before the legal engine finalizes it.",
      summary: `${preliminaryDecision.status}: ${preliminaryDecision.reason}`,
      confidence: preliminaryDecision.confidence,
      inputs: ["reasoning_package", "gcam_applicability"],
      outputs: ["preliminary_decision"],
      evidence: supportingEvidence,
      knowledge: knowledgeAssets.decisionRecords,
    },
  ];

  return Object.freeze(stages.map((stage) => Object.freeze({ ...stage })));
}

export function buildReviewerDecisionContext(input: ReviewerDecisionPreparationInput): ReviewerDecisionContext {
  const knowledgeAssets = collectKnowledgeAssets(input.reviewerReasoningEngine, input.reviewerAssessment);
  const articleEvaluations = buildArticleEvaluations(
    input,
    input.reasonedDecision?.applicableArticles ?? input.subjectModuleArticleIds ?? [],
    input.reasonedDecision?.rejectedArticles ?? [],
  );
  const preliminaryDecision = buildPreliminaryDecision(
    input,
    input.reasonedDecision?.applicableArticles ?? input.subjectModuleArticleIds ?? [],
    input.reasonedDecision?.rejectedArticles ?? [],
    articleEvaluations,
  );
  const reasoning = Object.freeze({
    literalMeaning: normalizeText(selectGroundedEvidenceText(input) || input.intelligence.semantic.semanticMeaning || input.intelligence.context.localContext),
    impliedMeaning: normalizeText(
      input.reasonedDecision?.reasoning ??
        input.reasonedDecision?.narrativeAnalysis ??
        input.reviewerAssessment?.literalVsImpliedMeaning ??
        input.intelligence.semantic.riskContext ??
        "No implied meaning could be determined.",
    ),
    narrativeContext: normalizeText(input.intelligence.context.narrativeContext || input.reviewerAssessment?.narrativeUnderstanding || "No narrative context available."),
    speakerAnalysis: normalizeText([
      `speaker=${input.intelligence.speaker ?? "unknown"}`,
      `listener=${input.intelligence.listener ?? "unknown"}`,
      `target=${input.intelligence.target ?? "unknown"}`,
    ].join(" | ")),
    victimAnalysis: normalizeText([
      `victim=${input.intelligence.victim ?? "unknown"}`,
      `sceneType=${input.intelligence.sceneType}`,
    ].join(" | ")),
    socialImpact: normalizeText([
      input.intelligence.flags.condemnation ? "condemned" : "",
      input.intelligence.flags.promotion ? "promotional" : "",
      input.intelligence.flags.educational ? "educational" : "",
      input.intelligence.flags.quotation ? "quoted" : "",
      input.intelligence.flags.neutrality ? "neutral" : "",
    ].filter(Boolean).join(", ") || "context-sensitive"),
    articleEvaluations,
    applicableGcamArticles: Object.freeze(articleEvaluations.filter((evaluation) => evaluation.status === "PASS").map((evaluation) => evaluation.articleId)),
    rejectedGcamArticles: Object.freeze(articleEvaluations.filter((evaluation) => evaluation.status === "FAIL").map((evaluation) => evaluation.articleId)),
    supportingEvidence: Object.freeze(uniqueStrings([
      ...(input.reasonedDecision?.supportingEvidence ?? []),
      selectGroundedEvidenceText(input),
    ])),
    counterEvidence: Object.freeze(uniqueStrings([
      ...(input.reasonedDecision?.contradictingEvidence ?? []),
      ...(input.intelligence.evidence.notes ?? []),
      input.intelligence.flags.quotation ? "Quoted speech may change the reading." : "",
      input.intelligence.flags.educational ? "Educational framing may reduce severity." : "",
      input.intelligence.flags.condemnation ? "Condemnation may negate endorsement." : "",
    ])),
    confidenceExplanation: normalizeText([
      `Semantic confidence ${clampConfidence(input.intelligence.semantic.confidence).toFixed(6)}.`,
      `Narrative confidence ${clampConfidence(input.intelligence.narrative.confidence).toFixed(6)}.`,
      `Evidence confidence ${clampConfidence(input.intelligence.evidence.confidence).toFixed(6)}.`,
      `Context confidence ${clampConfidence(input.intelligence.context.confidence).toFixed(6)}.`,
      `Preliminary decision ${preliminaryDecision.status} at ${preliminaryDecision.confidence.toFixed(6)}.`,
    ].join(" ")),
    preliminaryDecision,
    stages: buildReasoningStages(input, knowledgeAssets, preliminaryDecision),
  });

  const gcamMapping = Object.freeze({
    subjectModuleArticleIds: Object.freeze([...new Set(input.subjectModuleArticleIds ?? [])].sort((left, right) => left - right)),
    applicableArticles: reasoning.applicableGcamArticles,
    rejectedArticles: reasoning.rejectedGcamArticles,
    confidence: reasoning.preliminaryDecision.confidence,
    reasoning: reasoning.confidenceExplanation,
  });

  return Object.freeze({
    knowledgeAssets,
    gcamMapping,
    narrativeReasoning: knowledgeAssets.narrativeReasoning,
    intentReasoning: knowledgeAssets.intentReasoning,
    relationshipReasoning: knowledgeAssets.relationshipReasoning,
    reasoning,
  });
}
