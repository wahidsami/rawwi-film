import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type {
  ReviewerArticleRankingReport,
  ReviewerAtomRankingReport,
  ReviewerRankingBaseInput,
  ReviewerCandidateSelectionDiagnostics,
} from "./rankingTypes.js";

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function uniqueNonEmpty(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)));
}

function collectPromptText(value: unknown, values: string[]): void {
  if (typeof value === "string") {
    values.push(value);
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    values.push(String(value));
    return;
  }

  if (typeof value === "boolean") {
    values.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPromptText(item, values);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectPromptText(nested, values);
    }
  }
}

function collectConceptTerms(conceptContext: ConceptContext): readonly string[] {
  const terms: string[] = [];
  for (const concept of conceptContext.concepts) {
    terms.push(concept.id, concept.label);
    terms.push(...concept.originatingSentences);
    terms.push(...concept.entityReferences);
    terms.push(...concept.glossaryReferences);
    for (const source of concept.evidenceSources) {
      terms.push(source.sourceText, source.originatingSentence ?? "", source.glossaryTerm ?? "", source.entityId ?? "");
    }
  }
  terms.push(...conceptContext.conceptIds);
  terms.push(conceptContext.primaryConceptId ?? "");
  return uniqueNonEmpty(terms);
}

function collectAssessmentTerms(assessment: ReviewerAssessment): readonly string[] {
  return uniqueNonEmpty([
    assessment.methodologyId,
    assessment.methodologyTitle,
    assessment.narrativeUnderstanding,
    assessment.speaker ?? "",
    assessment.target ?? "",
    assessment.victim ?? "",
    assessment.narrativeIntent,
    assessment.evidenceStrength.toFixed(6),
    assessment.contextClassification,
    assessment.literalVsImpliedMeaning,
    ...(assessment.exceptionSignals ?? []),
    ...(assessment.reasoningTrace ?? []),
    ...(assessment.stageResults ?? []).map((stage) => stage.summary),
    ...(assessment.applicableConceptIds ?? []),
    `confidence:${assessment.confidence.toFixed(6)}`,
    `concept_confidence:${assessment.conceptConfidence.toFixed(6)}`,
    `concept_count:${assessment.conceptCount}`,
  ]);
}

function collectSemanticLayerTerms(input: V3PromptBuilderInput): readonly string[] {
  const terms: string[] = [];
  collectPromptText(input.reasoningContract.title, terms);
  collectPromptText(input.reasoningContract.overview ?? "", terms);
  collectPromptText(input.reasoningContract.principles ?? [], terms);
  for (const stage of input.reasoningContract.stages) {
    collectPromptText(stage.key, terms);
    collectPromptText(stage.title, terms);
    collectPromptText(stage.purpose, terms);
    collectPromptText(stage.description ?? "", terms);
    collectPromptText(stage.inputs ?? [], terms);
    collectPromptText(stage.outputs ?? [], terms);
    collectPromptText(stage.notes ?? [], terms);
  }

  collectPromptText(input.decisionGraph.title, terms);
  collectPromptText(input.decisionGraph.overview ?? "", terms);
  collectPromptText(input.decisionGraph.globalFlow ?? [], terms);
  collectPromptText(input.decisionGraph.globalExitConditions ?? [], terms);
  collectPromptText(input.decisionGraph.evidencePriority ?? [], terms);
  collectPromptText(input.decisionGraph.contextPriority ?? [], terms);
  collectPromptText(input.decisionGraph.example ?? "", terms);
  for (const node of input.decisionGraph.nodes) {
    collectPromptText(node.id, terms);
    collectPromptText(node.type, terms);
    collectPromptText(node.title, terms);
    collectPromptText(node.purpose, terms);
    collectPromptText(node.inputs ?? [], terms);
    collectPromptText(node.outputs ?? [], terms);
    collectPromptText(node.exitConditions ?? [], terms);
    collectPromptText(node.downstreamNodes ?? [], terms);
    collectPromptText(node.possibleBranches ?? [], terms);
  }

  collectPromptText(input.semanticLayer.title, terms);
  collectPromptText(input.semanticLayer.purpose ?? "", terms);
  collectPromptText(input.semanticLayer.meaningQuestions ?? [], terms);
  collectPromptText(input.semanticLayer.narrativeIntentOptions ?? [], terms);
  collectPromptText(input.semanticLayer.conversationRoles ?? [], terms);
  collectPromptText(input.semanticLayer.sceneRoles ?? [], terms);
  collectPromptText(input.semanticLayer.outputs ?? [], terms);
  collectPromptText(input.semanticLayer.states ?? [], terms);
  collectPromptText(input.semanticLayer.signals ?? [], terms);
  collectPromptText(input.semanticLayer.notes ?? [], terms);
  collectPromptText(input.semanticLayer.examples?.good ?? [], terms);
  collectPromptText(input.semanticLayer.examples?.bad ?? [], terms);
  collectPromptText(input.semanticLayer.examples?.edgeCases ?? [], terms);
  collectPromptText(input.semanticLayer.examples?.falsePositives ?? [], terms);
  collectPromptText(input.semanticLayer.examples?.falseNegatives ?? [], terms);

  collectPromptText(input.subjectModule.id, terms);
  collectPromptText(input.subjectModule.titleAr, terms);
  collectPromptText(input.subjectModule.scope ?? "", terms);
  collectPromptText(input.subjectModule.rules ?? [], terms);
  collectPromptText(input.subjectModule.exclusions ?? [], terms);
  collectPromptText(input.subjectModule.requiredEvidence ?? [], terms);
  collectPromptText(input.subjectModule.decisionTree ?? [], terms);
  collectPromptText(input.subjectModule.examples ?? [], terms);
  collectPromptText(input.subjectModule.nonExamples ?? [], terms);
  collectPromptText(input.subjectModule.notes ?? [], terms);
  collectPromptText(input.subjectModule.articleIds ?? [], terms);

  collectPromptText(input.glossary.title, terms);
  collectPromptText(input.glossary.notes ?? [], terms);
  for (const entry of input.glossary.entries) {
    collectPromptText(entry.term, terms);
    collectPromptText(entry.definition ?? "", terms);
    collectPromptText(entry.variants ?? [], terms);
    collectPromptText(entry.articleId ?? "", terms);
  }

  collectPromptText(input.chunkContext.localChunk, terms);
  collectPromptText(input.chunkContext.neighboringSentences ?? [], terms);
  collectPromptText(input.chunkContext.sceneMemory ?? "", terms);
  collectPromptText(input.storyMemory, terms);

  return uniqueNonEmpty(terms);
}

export function buildCandidateRankingSignalTerms(input: Pick<ReviewerRankingBaseInput, "promptInput" | "conceptContext" | "assessment">, scopeCategories: readonly string[]): readonly string[] {
  return uniqueNonEmpty([
    ...collectAssessmentTerms(input.assessment),
    ...collectConceptTerms(input.conceptContext),
    ...collectSemanticLayerTerms(input.promptInput),
    ...scopeCategories,
  ]);
}

export function buildCandidateSelectionDiagnostics(input: Readonly<{
  enabled: boolean;
  routing: ReviewerCandidateSelectionDiagnostics["routing"];
  resolvedReviewerFolders: readonly string[];
  selectedReviewerIds: readonly string[];
  selectedReviewerLabels: readonly string[];
  rejectedReviewerIds: readonly string[];
  rejectedReviewerLabels: readonly string[];
  reviewerScores: ReviewerCandidateSelectionDiagnostics["reviewerScores"];
  articleRanking: ReviewerArticleRankingReport;
  atomRanking: ReviewerAtomRankingReport;
  legacyArticleCount: number;
  legacyAtomCount: number;
  legacyPromptCharacterCount: number;
  candidatePromptCharacterCount: number;
  finalAcceptedCandidate: ReviewerCandidateSelectionDiagnostics["finalAcceptedCandidate"];
}>): ReviewerCandidateSelectionDiagnostics {
  const selectedArticleCount = input.articleRanking.selectedArticleCount;
  const selectedAtomCount = input.atomRanking.selectedAtomCount;
  const articleReductionPercent = input.legacyArticleCount === 0
    ? 0
    : Number((((input.legacyArticleCount - selectedArticleCount) / input.legacyArticleCount) * 100).toFixed(2));
  const atomReductionPercent = input.legacyAtomCount === 0
    ? 0
    : Number((((input.legacyAtomCount - selectedAtomCount) / input.legacyAtomCount) * 100).toFixed(2));
  const promptReductionPercent = input.legacyPromptCharacterCount === 0
    ? 0
    : Number((((input.legacyPromptCharacterCount - input.candidatePromptCharacterCount) / input.legacyPromptCharacterCount) * 100).toFixed(2));

  return Object.freeze({
    enabled: input.enabled,
    routing: input.routing,
    resolvedReviewerFolders: Object.freeze([...input.resolvedReviewerFolders]),
    selectedReviewerIds: Object.freeze([...input.selectedReviewerIds]),
    selectedReviewerLabels: Object.freeze([...input.selectedReviewerLabels]),
    rejectedReviewerIds: Object.freeze([...input.rejectedReviewerIds]),
    rejectedReviewerLabels: Object.freeze([...input.rejectedReviewerLabels]),
    reviewerScores: input.reviewerScores,
    articleRanking: input.articleRanking,
    atomRanking: input.atomRanking,
    legacyArticleCount: input.legacyArticleCount,
    legacyAtomCount: input.legacyAtomCount,
    selectedArticleCount,
    selectedAtomCount,
    articleReductionPercent,
    atomReductionPercent,
    legacyPromptCharacterCount: input.legacyPromptCharacterCount,
    candidatePromptCharacterCount: input.candidatePromptCharacterCount,
    promptReductionPercent,
    finalAcceptedCandidate: input.finalAcceptedCandidate,
  });
}
