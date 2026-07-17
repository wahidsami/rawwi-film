import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { createDefaultAnalysisEngineConfig } from "../engine/analysisConfig.js";
import type { AnalysisRequest } from "../engine/analysisRequest.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { buildV3ProviderUserPrompt } from "../provider/provider.js";
import { createV3ProviderFactory } from "../provider/providerFactory.js";
import { mapV3ProviderResponse } from "../provider/responseMapper.js";
import type { V3ProviderRawResponse } from "../provider/providerTypes.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { getDefaultReviewerQuestionSet } from "../reviewerQuestions/index.js";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";
import { PROFANITY_MODULE } from "../legal/modules/profanity/profanityModule.js";
import { RELIGION_MODULE } from "../legal/modules/religion/religionModule.js";
import { NATIONAL_SECURITY_MODULE } from "../legal/modules/nationalSecurity/nationalSecurityModule.js";
import { STATE_LEADERSHIP_MODULE } from "../legal/modules/stateLeadership/stateLeadershipModule.js";
import { CHILDREN_MODULE } from "../legal/modules/children/childrenModule.js";
import { VIOLENCE_MODULE } from "../legal/modules/violence/violenceModule.js";
import { SEXUALITY_MODULE } from "../legal/modules/sexuality/sexualityModule.js";
import { DRUGS_MODULE } from "../legal/modules/drugs/drugsModule.js";
import { SOCIETY_MODULE } from "../legal/modules/society/societyModule.js";
import { FAMILY_VALUES_MODULE } from "../legal/modules/familyValues/familyValuesModule.js";
import { HISTORY_MODULE } from "../legal/modules/history/historyModule.js";
import { POLITICS_MODULE } from "../legal/modules/politics/politicsModule.js";
import { CRIME_MODULE } from "../legal/modules/crime/crimeModule.js";
import { TRAVEL_MODULE } from "../legal/modules/travel/travelModule.js";
import { createLegalEngine } from "../legal/legalEngine.js";
import { createLegalModuleLoader } from "../legal/legalModuleLoader.js";
import { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";
import type { V3PromptGlossary, V3PromptOutputSchema, V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { V3RuntimeAdapterRequest, V3RuntimeAdapterOptions, V3RuntimeAdapterResult } from "./runtimeTypes.js";
import type { ReviewerScopeValidatorResult } from "./reviewerScopeValidator.js";
import { createV3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import { buildRuntimeTruthLayerMeta } from "./reportMapper.js";
import { evaluateRuntimeGcamMapping, mapLegalDecisionToFindings } from "./findingMapper.js";
import { canonicalStringify } from "../../canonicalJson.js";
import { sha256 } from "../../hash.js";
import { persistAnalysisExecutionSignature, type AnalysisExecutionSignatureInput } from "../../executionSignature.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { toPromptBuilderInput } from "../engine/analysisRequest.js";
import type { V3StageHash, V3StageTiming } from "../pipeline/pipelineTypes.js";
import { buildV3ReasoningTrace } from "../debug/reasoningTrace.js";
import { v3InspectionRecorder } from "../inspection/index.js";
import { buildV3InspectionChunkFindingKey } from "../inspection/inspectionKeys.js";
import {
  buildV3FindingMapperInspectionRecord,
  buildV3ArbitrationInspectionRecord,
  buildV3ExplanationInspectionRecord,
  buildV3KnowledgeMatchingInspectionRecord,
  buildV3LegalReviewInspectionRecord,
  buildV3KnowledgeRegistryInspectionRecord,
  buildV3KnowledgeRankingInspectionRecord,
  buildV3SemanticGenerationInspectionRecord,
  buildV3ReviewerDebateInspectionRecord,
} from "../inspection/inspectionStageBuilders.js";
import { createKnowledgeRankingReport } from "../reviewerKnowledge/knowledgeRanking/index.js";
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { buildReviewerDebatePackage } from "../reviewerDebate/index.js";
import { buildArbitrationDecisionPackage } from "../arbitration/index.js";
import { buildExplanationPackage } from "../explanation/index.js";
import { buildReviewerDecisionContext } from "../legal/reviewerDecisionPreparation.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import { buildExplanationSafeAnalysisResponse } from "./explanationSafeAnalysisResponse.js";
import { createEmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { validateReasonedDecisionAgainstEvidence } from "../provider/reasonedDecisionValidation.js";
import { validateReviewerScope } from "./reviewerScopeValidator.js";
import { buildV3LegalReasoningTrace, buildV3ReasoningMetrics } from "../reasoningTrace/index.js";
import { buildV3DiagnosticReport, type V3DiagnosticEvidenceTrace, type V3DiagnosticTraceRemovedItem, type V3DiagnosticTraceStage } from "./v3DiagnosticReport.js";
import type { V3RuntimeFinding } from "./runtimeTypes.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function normalizeTerms(terms: V3RuntimeAdapterRequest["promptLexiconTerms"]): V3PromptGlossary {
  return {
    title: "Runtime Glossary",
    entries: [...terms]
      .map((term) => ({
        term: term.term,
        articleId: term.gcam_article_id,
        variants: term.term_variants ?? undefined,
        definition: term.description ?? term.example_usage ?? undefined,
      }))
      .sort((left, right) => left.term.localeCompare(right.term)),
    notes: ["Derived from slang lexicon for the runtime adapter."],
  };
}

function defaultSubjectModule(): V3PromptSubjectModule {
  return {
    id: PROFANITY_MODULE.id,
    titleAr: "الألفاظ النابية",
    scope: "Direct profanity analysis only.",
    rules: ["Identify literal profanity in the chunk."],
    exclusions: ["Do not classify neutral quotations."],
    requiredEvidence: ["Literal profanity present in the chunk."],
    decisionTree: ["Is there literal profanity?", "Does context negate the literal reading?"],
    examples: ["A direct profanity in dialogue."],
    nonExamples: ["Educational mention of a profanity term."],
    articleIds: [...PROFANITY_MODULE.articleIds],
    notes: ["Runtime adapter default subject module."],
  };
}

function normalizeSubjectModule(subjectModule?: V3PromptSubjectModule): V3PromptSubjectModule {
  const module = subjectModule ?? defaultSubjectModule();
  if (module.id === PROFANITY_MODULE.id) return module;
  if (module.id === "v3_11_profanity") {
    return {
      ...module,
      id: PROFANITY_MODULE.id,
    };
  }
  if (module.id === "v3_09_sexual" || module.id === "v3_10_explicit" || module.id === SEXUALITY_MODULE.id) {
    return {
      ...module,
      id: SEXUALITY_MODULE.id,
    };
  }
  if (module.id === "v3_07_drugs" || module.id === DRUGS_MODULE.id) {
    return {
      ...module,
      id: DRUGS_MODULE.id,
    };
  }
  if (module.id === "v3_05_society" || module.id === SOCIETY_MODULE.id) {
    return {
      ...module,
      id: SOCIETY_MODULE.id,
    };
  }
  if (module.id === "v3_04_family_values" || module.id === FAMILY_VALUES_MODULE.id) {
    return {
      ...module,
      id: FAMILY_VALUES_MODULE.id,
    };
  }
  if (module.id === "v3_04_history" || module.id === HISTORY_MODULE.id) {
    return {
      ...module,
      id: HISTORY_MODULE.id,
    };
  }
  if (module.id === "v3_04_politics" || module.id === POLITICS_MODULE.id) {
    return {
      ...module,
      id: POLITICS_MODULE.id,
    };
  }
  if (module.id === "v3_09_crime" || module.id === CRIME_MODULE.id) {
    return {
      ...module,
      id: CRIME_MODULE.id,
    };
  }
  if (module.id === "v3_13_travel" || module.id === TRAVEL_MODULE.id) {
    return {
      ...module,
      id: TRAVEL_MODULE.id,
    };
  }
  if (module.id === "v3_06_children") {
    return {
      ...module,
      id: CHILDREN_MODULE.id,
    };
  }
  return module;
}

function buildTraceRemovedItem(label: string, reason: string, score?: number | null, metadata?: Readonly<Record<string, unknown>> | null): V3DiagnosticTraceRemovedItem {
  return {
    label,
    reason,
    score: score ?? null,
    metadata: metadata ?? null,
  };
}

function buildTraceStage(input: Readonly<{
  stage: string;
  inputCount: number;
  outputCount: number;
  removalReason: string | null;
  removedItems?: readonly V3DiagnosticTraceRemovedItem[];
  details: Readonly<Record<string, unknown>>;
}>): V3DiagnosticTraceStage {
  return {
    stage: input.stage,
    inputCount: input.inputCount,
    outputCount: input.outputCount,
    removedCount: Math.max(0, input.inputCount - input.outputCount),
    removalReason: input.removalReason,
    removedItems: [...(input.removedItems ?? [])],
    details: { ...input.details },
  };
}

async function writePromptAuditFile(input: Readonly<{
  jobId: string;
  chunkId: string;
  promptHash: string;
  modelName: string;
  systemPrompt: string;
  userPrompt: string;
  promptInput: V3PromptBuilderInput;
}>): Promise<string | null> {
  if (!config.V3_DIAGNOSTIC_MODE) return null;

  const compiledReviewerContext = input.promptInput.compiledReviewerContext ?? null;
  const candidateDiagnostics = compiledReviewerContext?.candidateDiagnostics ?? null;
  const candidateReviewers = candidateDiagnostics?.reviewerScores ?? compiledReviewerContext?.selection.reviewerScores ?? [];
  const candidateReviewerIds = candidateReviewers.map((score) => score.reviewerId);
  const selectedReviewerIds = candidateDiagnostics?.selectedReviewerIds ?? compiledReviewerContext?.selection.selectedReviewerIds ?? [];
  const selectedReviewerLabels = candidateDiagnostics?.selectedReviewerLabels ?? compiledReviewerContext?.selection.selectedReviewerLabels ?? [];
  const selectedArticles = compiledReviewerContext?.selectedArticles ?? [];
  const selectedAtoms = compiledReviewerContext?.selectedAtoms ?? [];
  const candidateArticles = candidateDiagnostics?.articleRanking.articleScores ?? [];
  const candidateAtoms = candidateDiagnostics?.atomRanking.atomScores ?? [];
  const evidenceExcerpts = [
    input.promptInput.chunkContext.localChunk,
    ...(input.promptInput.chunkContext.neighboringSentences ?? []),
    input.promptInput.chunkContext.sceneMemory ?? "",
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const auditRecord = {
    jobId: input.jobId,
    chunkId: input.chunkId,
    createdAt: new Date().toISOString(),
    promptHash: input.promptHash,
    modelName: input.modelName,
    promptLengthChars: input.systemPrompt.length + input.userPrompt.length,
    promptTokenEstimate: estimatePromptTokens(input.systemPrompt, input.userPrompt),
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    candidateReviewers,
    candidateReviewerIds,
    selectedReviewerLabels,
    selectedArticles: selectedArticles.map((article) => ({
      articleId: article.articleId,
      reviewer: article.reviewer,
      title: article.title,
      protectedInterest: article.protectedInterest,
      purpose: article.purpose,
      neighboringArticles: [...article.neighboringArticles],
      atoms: [...article.atoms],
      inherits: [...article.inherits],
      priority: article.priority,
      runtime: article.runtime,
      status: article.status,
      sourcePath: article.sourcePath,
    })),
    selectedAtoms: selectedAtoms.map((atom) => ({
      atomId: atom.atomId,
      articleId: atom.articleId,
      reviewer: atom.reviewer,
      title: atom.title,
      protectedInterest: atom.protectedInterest,
      inherits: [...atom.inherits],
      priority: atom.priority,
      runtime: atom.runtime,
      status: atom.status,
      sourcePath: atom.sourcePath,
    })),
    candidateArticles: candidateArticles.map((article) => ({
      articleId: article.articleId,
      policyArticleId: article.policyArticleId,
      reviewer: article.reviewer,
      articleNumber: article.articleNumber,
      policyTitle: article.policyTitle,
      score: article.score,
      confidence: article.confidence,
      reasons: [...article.reasons],
      matchedTerms: [...article.matchedTerms],
      selected: article.selected,
      sourcePath: article.sourcePath,
      priority: article.priority,
      runtime: article.runtime,
      retrievalEnabled: article.retrievalEnabled,
      atomCount: article.atomCount,
    })),
    candidateAtoms: candidateAtoms.map((atom) => ({
      atomId: atom.atomId,
      articleId: atom.articleId,
      policyArticleId: atom.policyArticleId,
      reviewer: atom.reviewer,
      articleNumber: atom.articleNumber,
      policyAtomId: atom.policyAtomId,
      policyAtomTitle: atom.policyAtomTitle,
      canonicalAtoms: [...atom.canonicalAtoms],
      score: atom.score,
      confidence: atom.confidence,
      reasons: [...atom.reasons],
      matchedTerms: [...atom.matchedTerms],
      selected: atom.selected,
      sourcePath: atom.sourcePath,
      priority: atom.priority,
      runtime: atom.runtime,
      retrievalEnabled: atom.retrievalEnabled,
    })),
    evidenceExcerpts,
    reviewerInstructions: {
      reasoningContract: input.promptInput.reasoningContract,
      decisionGraph: input.promptInput.decisionGraph,
      semanticLayer: input.promptInput.semanticLayer,
      subjectModule: input.promptInput.subjectModule,
      chunkContext: input.promptInput.chunkContext,
    },
    universalInstructions: {
      reviewerMethodology: getDefaultReviewerMethodology(),
      reviewerQuestionSet: getDefaultReviewerQuestionSet(),
      outputSchema: input.promptInput.outputSchema,
    },
    exceptionRules: {
      outputSchemaNotes: input.promptInput.outputSchema.notes ?? [],
      gptReviewerAssistant: compiledReviewerContext?.candidateDiagnostics
        ? {
            selectedReviewerIds,
            selectedReviewerLabels,
          }
        : null,
    },
    exactJsonSchemaRequestedFromGpt: input.promptInput.outputSchema,
    compiledReviewerContext: compiledReviewerContext
      ? {
          selection: compiledReviewerContext.selection,
          selectedReviewerPackages: compiledReviewerContext.selectedReviewerPackages.map((pkg) => ({
            reviewer: pkg.reviewer,
            folder: pkg.folder,
            loadedManualCount: pkg.loadedManualCount,
            loadedArticleCount: pkg.loadedArticleCount,
            loadedAtomCount: pkg.loadedAtomCount,
            estimatedTokenCount: pkg.estimatedTokenCount,
          })),
          selectedArticles: selectedArticles.map((article) => article.articleId),
          selectedAtoms: selectedAtoms.map((atom) => atom.atomId),
        }
      : null,
  };

  const auditDir = join(tmpdir(), "raawifilm-v3-prompt-audits");
  const auditPath = join(auditDir, `prompt-audit-${input.promptHash.slice(0, 16)}-${Date.now()}.json`);
  await mkdir(auditDir, { recursive: true });
  await writeFile(auditPath, JSON.stringify(auditRecord, null, 2), "utf8");
  return auditPath;
}

function buildEvidenceTrace(input: Readonly<{
  originalChunkText: string;
  promptAuditFilePath: string | null;
  analysisRequest: AnalysisRequest;
  promptInput: V3PromptBuilderInput;
  renderedPrompt: ReturnType<typeof buildV3RenderedPrompt>;
  userPrompt: string;
  rawResponse: V3ProviderRawResponse;
  mapped: ReturnType<typeof mapV3ProviderResponse>;
  groundingValidation: ReturnType<typeof validateReasonedDecisionAgainstEvidence>;
  scopeValidation: ReviewerScopeValidatorResult;
  findings: readonly V3RuntimeFinding[];
  validatedLegalDecision: LegalDecision;
  gcamMapping: ReturnType<typeof evaluateRuntimeGcamMapping>;
  reviewerKnowledgeSelection: ReturnType<typeof createEmergencyContextualReviewerKnowledgeSelection>;
  reviewerKnowledgeRetrieval: ReturnType<typeof createReviewerKnowledgeRetrievalReport>;
  reviewerCompiledContext: import("../reviewerCompiler/compilerTypes.js").ReviewerCompiledContext | null;
  candidateDiagnostics: import("../ranking/rankingTypes.js").ReviewerCandidateSelectionDiagnostics | null;
}>): V3DiagnosticEvidenceTrace {
  const candidateDiagnostics = input.candidateDiagnostics;
  const reviewerScores = candidateDiagnostics?.reviewerScores ?? input.reviewerKnowledgeSelection.routing.reviewerScores;
  const selectedReviewerIds = candidateDiagnostics?.selectedReviewerIds ?? input.reviewerKnowledgeSelection.routing.selectedReviewerIds;
  const selectedReviewerLabels = candidateDiagnostics?.selectedReviewerLabels ?? input.reviewerKnowledgeSelection.routing.selectedReviewerLabels;
  const candidateReviewerIds = reviewerScores.map((score) => score.reviewerId);
  const articleScores = candidateDiagnostics?.articleRanking.articleScores ?? [];
  const selectedArticleIds = candidateDiagnostics?.articleRanking.selectedArticleIds ?? [];
  const atomScores = candidateDiagnostics?.atomRanking.atomScores ?? [];
  const selectedAtomIds = candidateDiagnostics?.atomRanking.selectedAtomIds ?? [];
  const selectedArticles = input.reviewerCompiledContext?.selectedArticles ?? [];
  const selectedAtoms = input.reviewerCompiledContext?.selectedAtoms ?? [];
  const evidenceCandidates = input.mapped.evidence.candidates;
  const evidenceSpans = evidenceCandidates.map((candidate, index) => ({
    index,
    text: candidate.text,
    startOffset: candidate.startOffset,
    endOffset: candidate.endOffset,
    confidence: candidate.confidence,
    source: candidate.source,
    notes: [...(candidate.notes ?? [])],
  }));

  const reviewerRemoved = reviewerScores
    .filter((score) => !selectedReviewerIds.includes(score.reviewerId))
    .map((score) => buildTraceRemovedItem(score.label, score.reasons.length > 0 ? score.reasons.join(" | ") : "not selected by routing", score.score, {
      reviewerId: score.reviewerId,
      packId: score.packId,
      folder: score.folder,
      confidence: score.confidence,
    }));

  const articleRemoved = articleScores
    .filter((score) => !selectedArticleIds.includes(score.articleId))
    .map((score) => buildTraceRemovedItem(`Article ${score.policyArticleId}`, score.reasons.length > 0 ? score.reasons.join(" | ") : "not selected by top-K ranking", score.score, {
      articleId: score.articleId,
      reviewer: score.reviewer,
      policyArticleId: score.policyArticleId,
      confidence: score.confidence,
    }));

  const atomRemoved = atomScores
    .filter((score) => !selectedAtomIds.includes(score.atomId))
    .map((score) => buildTraceRemovedItem(`Atom ${score.policyAtomId ?? score.atomId}`, score.reasons.length > 0 ? score.reasons.join(" | ") : "not selected by top-K ranking", score.score, {
      atomId: score.atomId,
      articleId: score.articleId,
      reviewer: score.reviewer,
      policyAtomId: score.policyAtomId,
      confidence: score.confidence,
    }));

  const stages: V3DiagnosticTraceStage[] = [
    buildTraceStage({
      stage: "original_chunk",
      inputCount: 1,
      outputCount: 1,
      removalReason: null,
      removedItems: [],
      details: {
        chunk_text: input.originalChunkText,
        chunk_start_offset: input.analysisRequest.chunk.startOffset,
        chunk_end_offset: input.analysisRequest.chunk.endOffset,
        chunk_index: input.analysisRequest.chunk.chunkIndex,
      },
    }),
    buildTraceStage({
      stage: "evidence_extraction",
      inputCount: 1,
      outputCount: evidenceSpans.length,
      removalReason: evidenceSpans.length < 1 ? "No evidence spans were extracted." : null,
      removedItems: [],
      details: {
        evidence_spans: evidenceSpans,
        returned_findings_count: input.mapped.reasonedDecision.articleEvaluations.length,
        returned_articles: input.mapped.reasonedDecision.articleEvaluations.filter((evaluation) => evaluation.status === "PASS").map((evaluation) => evaluation.articleId),
        returned_atoms: [],
        returned_evidence: evidenceSpans.map((span) => span.text),
      },
    }),
    buildTraceStage({
      stage: "candidate_reviewers",
      inputCount: reviewerScores.length,
      outputCount: selectedReviewerIds.length,
      removalReason: reviewerRemoved.length > 0 ? "Selected reviewers only." : null,
      removedItems: reviewerRemoved,
      details: {
        reviewer_scores: reviewerScores,
        selected_reviewers: selectedReviewerIds,
        selected_reviewer_labels: selectedReviewerLabels,
      },
    }),
    buildTraceStage({
      stage: "selected_reviewers",
      inputCount: selectedReviewerIds.length,
      outputCount: selectedReviewerIds.length,
      removalReason: null,
      removedItems: [],
      details: {
        selected_reviewers: selectedReviewerIds,
        selected_reviewer_labels: selectedReviewerLabels,
      },
    }),
    buildTraceStage({
      stage: "candidate_articles",
      inputCount: articleScores.length,
      outputCount: selectedArticleIds.length,
      removalReason: articleRemoved.length > 0 ? "Top-K article ranking." : null,
      removedItems: articleRemoved,
      details: {
        candidate_articles: articleScores,
        selected_articles: selectedArticles.map((article) => article.articleId),
      },
    }),
    buildTraceStage({
      stage: "selected_articles",
      inputCount: selectedArticleIds.length,
      outputCount: selectedArticleIds.length,
      removalReason: null,
      removedItems: [],
      details: {
        selected_articles: selectedArticles.map((article) => ({
          articleId: article.articleId,
          reviewer: article.reviewer,
          title: article.title,
        })),
      },
    }),
    buildTraceStage({
      stage: "candidate_atoms",
      inputCount: atomScores.length,
      outputCount: selectedAtomIds.length,
      removalReason: atomRemoved.length > 0 ? "Top-K atom ranking." : null,
      removedItems: atomRemoved,
      details: {
        candidate_atoms: atomScores,
        selected_atoms: selectedAtoms.map((atom) => atom.atomId),
      },
    }),
    buildTraceStage({
      stage: "selected_atoms",
      inputCount: selectedAtomIds.length,
      outputCount: selectedAtomIds.length,
      removalReason: null,
      removedItems: [],
      details: {
        selected_atoms: selectedAtoms.map((atom) => ({
          atomId: atom.atomId,
          articleId: atom.articleId,
          reviewer: atom.reviewer,
          title: atom.title,
        })),
      },
    }),
    buildTraceStage({
      stage: "reviewer_package_compiled",
      inputCount: selectedArticles.length,
      outputCount: selectedArticles.length,
      removalReason: null,
      removedItems: [],
      details: {
        knowledge_retrieval: {
          query_terms: input.reviewerKnowledgeRetrieval.queryTerms,
          top_k: input.reviewerKnowledgeRetrieval.topK,
          selected_pack_count: input.reviewerKnowledgeRetrieval.selectedPacks.length,
          rejected_pack_count: input.reviewerKnowledgeRetrieval.rejectedPacks.length,
          cache_hit: input.reviewerKnowledgeRetrieval.cacheHit,
        },
        compiled_reviewer_context: input.reviewerCompiledContext ? {
          loaded_manual_count: input.reviewerCompiledContext.loadedManualCount,
          loaded_reviewer_count: input.reviewerCompiledContext.loadedReviewerCount,
          loaded_article_count: input.reviewerCompiledContext.loadedArticleCount,
          loaded_atom_count: input.reviewerCompiledContext.loadedAtomCount,
          prompt_character_count: input.reviewerCompiledContext.promptCharacterCount,
          prompt_token_estimate: input.reviewerCompiledContext.promptTokenEstimate,
        } : null,
        selected_reviewer_packages: input.reviewerCompiledContext?.selectedReviewerPackages.map((pkg) => ({
          reviewer: pkg.reviewer,
          folder: pkg.folder,
          loaded_manual_count: pkg.loadedManualCount,
          loaded_article_count: pkg.loadedArticleCount,
          loaded_atom_count: pkg.loadedAtomCount,
          estimated_token_count: pkg.estimatedTokenCount,
        })) ?? [],
      },
    }),
    buildTraceStage({
      stage: "prompt_audit",
      inputCount: 1,
      outputCount: 1,
      removalReason: null,
      removedItems: [],
      details: {
        prompt_audit_file_path: input.promptAuditFilePath,
        system_prompt_length_chars: input.renderedPrompt.prompt.length,
        user_prompt_length_chars: input.userPrompt.length,
        prompt_token_estimate: estimatePromptTokens(input.renderedPrompt.prompt, input.userPrompt),
      },
    }),
    buildTraceStage({
      stage: "provider_response",
      inputCount: 1,
      outputCount: input.mapped.reasonedDecision.articleEvaluations.length,
      removalReason: null,
      removedItems: input.mapped.reasonedDecision.articleEvaluations
        .filter((evaluation) => evaluation.status !== "PASS")
        .map((evaluation) => buildTraceRemovedItem(`Article ${evaluation.articleId}`, evaluation.reason, evaluation.confidence, {
          articleId: evaluation.articleId,
          status: evaluation.status,
        })),
      details: {
        provider_response: input.rawResponse,
        parsed_response: {
          narrative: input.mapped.narrative,
          evidence: input.mapped.evidence,
          semantic: input.mapped.semantic,
          context: input.mapped.context,
          reasoned_decision: input.mapped.reasonedDecision,
        },
        returned_findings_count: input.mapped.reasonedDecision.articleEvaluations.length,
        returned_articles: input.mapped.reasonedDecision.articleEvaluations.map((evaluation) => evaluation.articleId),
        returned_atoms: input.mapped.reasonedDecision.applicableArticles.length > 0 ? input.mapped.reasonedDecision.applicableArticles : [],
        returned_evidence: input.mapped.reasonedDecision.supportingEvidence,
      },
    }),
    buildTraceStage({
      stage: "grounding_validation",
      inputCount: input.mapped.reasonedDecision.articleEvaluations.length,
      outputCount: input.groundingValidation.valid ? 1 : 0,
      removalReason: input.groundingValidation.valid ? null : input.groundingValidation.validationNote,
      removedItems: input.groundingValidation.issues.map((issue) => buildTraceRemovedItem(issue.path, issue.message, null, {
        code: issue.code,
      })),
      details: {
        valid: input.groundingValidation.valid,
        issues: input.groundingValidation.issues,
        validation_note: input.groundingValidation.validationNote,
        accepted_count: input.groundingValidation.valid ? 1 : 0,
        rejected_count: input.groundingValidation.issues.length,
      },
    }),
    buildTraceStage({
      stage: "scope_validation",
      inputCount: input.groundingValidation.valid ? 1 : 0,
      outputCount: input.scopeValidation.acceptedFindingsCount,
      removalReason: input.scopeValidation.rejectedFindingsByScope.length > 0 ? input.scopeValidation.scopeReason : null,
      removedItems: input.scopeValidation.rejectedFindingsByScope.map((finding) => buildTraceRemovedItem(
        finding.articleIds[0] ? `Article ${finding.articleIds[0]}` : "scope finding",
        input.scopeValidation.scopeReason,
        null,
        {
          moduleId: finding.moduleId,
          articleIds: finding.articleIds,
          evidence: finding.evidence,
        },
      )),
      details: {
        accepted_count: input.scopeValidation.acceptedFindingsCount,
        rejected_count: input.scopeValidation.rejectedFindingsByScope.length,
        selected_reviewers: input.scopeValidation.selectedReviewerLabels,
        rejected_reviewers: input.scopeValidation.rejectedReviewerLabels,
      },
    }),
    buildTraceStage({
      stage: "mapper",
      inputCount: input.scopeValidation.acceptedFindingsCount,
      outputCount: input.findings.length,
      removalReason: input.findings.length === 0 ? "Exception applied" : null,
      removedItems: input.findings.length === 0 && input.validatedLegalDecision.finding
        ? [buildTraceRemovedItem(
            `Article ${input.validatedLegalDecision.finding.articleIds[0] ?? input.validatedLegalDecision.articleIds[0] ?? 0}`,
            input.validatedLegalDecision.reason,
            input.validatedLegalDecision.confidence,
            {
              moduleId: input.validatedLegalDecision.moduleId,
              articleIds: input.validatedLegalDecision.articleIds,
            },
          )]
        : [],
      details: {
        validated_decision_status: input.validatedLegalDecision.status,
        validated_decision_reason: input.validatedLegalDecision.reason,
        mapper_findings: input.findings,
        gcam_mapping: input.gcamMapping,
      },
    }),
    buildTraceStage({
      stage: "persistence",
      inputCount: input.findings.length,
      outputCount: input.findings.length,
      removalReason: null,
      removedItems: [],
      details: {
        attempted_findings: input.findings.length,
        inserted_findings: null,
        skipped_findings: null,
      },
    }),
  ];

  return {
    originalChunkText: input.originalChunkText,
    promptAuditFilePath: input.promptAuditFilePath,
    stages: Object.freeze(stages),
    providerResponse: Object.freeze({
      rawResponse: input.rawResponse.rawResponse,
      rawResponseHash: sha256(input.rawResponse.rawResponse),
      responseId: input.rawResponse.responseId,
      responseTimestamp: input.rawResponse.responseTimestamp,
      providerName: input.rawResponse.providerName,
      modelName: input.rawResponse.modelName,
      modelVersion: input.rawResponse.modelVersion,
      finishReason: input.rawResponse.finishReason,
      usage: input.rawResponse.usage,
      parsedResponse: {
        narrative: input.mapped.narrative,
        evidence: input.mapped.evidence,
        semantic: input.mapped.semantic,
        context: input.mapped.context,
        reasonedDecision: input.mapped.reasonedDecision,
      },
    }),
    groundingValidation: Object.freeze({
      valid: input.groundingValidation.valid,
      validationNote: input.groundingValidation.validationNote,
      issues: input.groundingValidation.issues,
      acceptedCount: input.groundingValidation.valid ? 1 : 0,
      rejectedCount: input.groundingValidation.issues.length,
    }),
    scopeValidation: Object.freeze({
      selectedReviewerIds: input.scopeValidation.selectedReviewerIds,
      selectedReviewerLabels: input.scopeValidation.selectedReviewerLabels,
      rejectedReviewerIds: input.scopeValidation.rejectedReviewerIds,
      rejectedReviewerLabels: input.scopeValidation.rejectedReviewerLabels,
      acceptedFindingsCount: input.scopeValidation.acceptedFindingsCount,
      rejectedFindingsByScopeCount: input.scopeValidation.rejectedFindingsByScopeCount,
      scopeReason: input.scopeValidation.scopeReason,
    }),
    mapperResult: Object.freeze({
      inputCount: input.scopeValidation.acceptedFindingsCount,
      outputCount: input.findings.length,
      removedCount: Math.max(0, input.scopeValidation.acceptedFindingsCount - input.findings.length),
      removalReason: input.findings.length === 0 ? "Exception applied" : null,
      findings: input.findings,
      gcamMapping: input.gcamMapping,
    }),
    persistedFindings: null,
  };
}

function defaultOutputSchema(): V3PromptOutputSchema {
  return {
    title: "V3 Runtime Output Contract",
    fields: [
      { name: "narrative", description: "Narrative result", required: true },
      { name: "evidence", description: "Evidence result", required: true },
      { name: "semantic", description: "Semantic result", required: true },
      { name: "context", description: "Context result", required: true },
      { name: "reasoned_decision", description: "GPT Reviewer Assistant reasoning package with reasoning, alternative interpretations, supporting and contradicting evidence, applicable and rejected articles, risk analysis, narrative analysis, human-like explanation, and confidence.", required: true },
    ],
    notes: [
      "The evidence object must include candidates and primaryCandidateIndex.",
      "Each evidence candidate must include the compatibility fields required by the existing mapper: text, startOffset, endOffset, confidence, source, and notes.",
      "To preserve downstream compatibility, candidate objects should also include id, quote, offsetStart, offsetEnd, concepts, entities, and reason.",
      "The reasoned decision must be evidence-first, quote-grounded, article-by-article, and non-hallucinatory.",
      "The reasoned decision must answer reasoning, alternativeInterpretations, supportingEvidence, contradictingEvidence, applicableArticles, rejectedArticles, riskAnalysis, narrativeAnalysis, humanLikeExplanation, recommendation, and confidence.",
      "Do not invent facts, actors, objects, injuries, or events that are not present in the quoted evidence or current scene.",
      "If no article passes, return NO VIOLATION instead of guessing.",
      "Evaluate every GCAM article independently and return PASS or FAIL for each one.",
      "Use cases, precedents, lessons, blueprints, patterns, and relationships as reviewer memory, not as a substitute for evidence.",
      "Response is mapped into the existing V2 finding model after legal evaluation.",
    ],
    example: {
      narrative: {
        speaker: "Character A",
        listener: "Character B",
        target: "Character B",
        narrativeVoice: "dialogue",
        sceneType: "dialogue scene",
        narrativeIntent: "attack",
        storyPosition: "middle",
        relationship: "conflict",
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
        recommendation: "Support the finding, but let the legal engine make the final decision.",
        confidence: 0.95,
      },
      evidence: {
        candidates: [
          {
            id: "candidate-1",
            quote: "exact screenplay quote",
            text: "normalized evidence",
            offsetStart: 12,
            offsetEnd: 34,
            startOffset: 12,
            endOffset: 34,
            confidence: 0.95,
            concepts: [],
            entities: [],
            reason: "This quote directly supports the semantic conclusion.",
            source: "chunk",
            notes: [],
          },
        ],
        primaryCandidateIndex: 0,
        admissible: true,
        confidence: 0.95,
      },
      semantic: {
        semanticMeaning: "normalized semantic meaning",
        narrativeIntent: "attack",
        conversationRole: "speaker",
        sceneRole: "dialogue scene",
        speaker: "Character A",
        listener: "Character B",
        target: "Character B",
        victim: "Character B",
        emotion: "hostile",
        riskContext: "high",
        confidence: 0.95,
      },
      context: {
        storyMemory: "story memory",
        sceneMemory: "scene memory",
        localContext: "exact screenplay quote",
        chunkContext: "chunk_index=0; start=0; end=34",
        neighboringSentences: [],
        narrativeContext: "contextual narrative summary",
        confidence: 0.95,
      },
      reasoned_decision: {
        reasoning: "The quote directly supports the semantic conclusion.",
        alternative_interpretations: ["The line could be read as a joke, but the context supports a direct attack."],
        supporting_evidence: ["exact screenplay quote"],
        contradicting_evidence: [],
        applicable_articles: [11],
        rejected_articles: [4],
        risk_analysis: "Low ambiguity because the quote is explicit.",
        narrative_analysis: "Direct dialogue attack with no blocking exception.",
        human_like_explanation: "A human reviewer would likely say the same line is explicit and direct.",
        confidence: 0.95,
      },
    },
  };
}

function buildRuntimeAnalysisRequest(
  input: V3RuntimeAdapterRequest,
  options: V3RuntimeAdapterOptions,
): AnalysisRequest {
  return {
    chunk: {
      text: input.chunkText,
      startOffset: input.chunkStart,
      endOffset: input.chunkEnd,
      chunkIndex: input.chunkIndex,
    },
    storyMemory: input.analysisPromptContext ?? input.storyMemory ?? null,
    sceneMemory: input.sceneMemory,
    neighboringSentences: [...input.neighboringSentences],
    glossary: normalizeTerms(input.promptLexiconTerms),
    subjectModule: normalizeSubjectModule(options.subjectModule),
    outputSchema: options.outputSchema ?? defaultOutputSchema(),
  };
}

function buildPromptInput(request: AnalysisRequest) {
  const defaults = createDefaultAnalysisEngineConfig();
  return toPromptBuilderInput(request, {
    reasoningContract: defaults.reasoningContract,
    decisionGraph: defaults.decisionGraph,
    semanticLayer: defaults.semanticLayer,
  });
}

function buildExecutionSignatureRow(input: {
  signatureContext: AnalysisExecutionSignatureInput;
  providerName: string;
  modelName: string;
  temperature: number | null;
  topP: number | null;
  seed: number | null;
  maxTokens: number | null;
  responseFormat: string | null;
  systemPrompt: string;
  userPrompt: string;
}): Omit<AnalysisExecutionSignatureInput, "system_prompt_hash" | "user_prompt_hash" | "combined_prompt_hash"> & {
  system_prompt_hash: string;
  user_prompt_hash: string;
  combined_prompt_hash: string;
} {
  return {
    ...input.signatureContext,
    provider_name: input.providerName,
    model_name: input.modelName,
    model_version: input.signatureContext.model_version ?? null,
    router_model_name: input.signatureContext.router_model_name ?? null,
    auditor_model_name: input.signatureContext.auditor_model_name ?? null,
    rationale_model_name: input.signatureContext.rationale_model_name ?? null,
    temperature: input.temperature,
    top_p: input.topP,
    seed: input.seed,
    max_tokens: input.maxTokens,
    reasoning_effort: input.signatureContext.reasoning_effort ?? null,
    response_format: input.responseFormat,
    pipeline_version: input.signatureContext.pipeline_version ?? null,
    analysis_engine_version: input.signatureContext.analysis_engine_version ?? "v3",
    memory_version: input.signatureContext.memory_version ?? null,
    scene_memory_version: input.signatureContext.scene_memory_version ?? null,
    script_memory_version: input.signatureContext.script_memory_version ?? null,
    evidence_pinning_version: input.signatureContext.evidence_pinning_version ?? null,
    router_version: input.signatureContext.router_version ?? null,
    grounding_version: input.signatureContext.grounding_version ?? null,
    validator_version: input.signatureContext.validator_version ?? null,
    aggregation_version: input.signatureContext.aggregation_version ?? null,
    auditor_version: input.signatureContext.auditor_version ?? null,
    violation_system_version: input.signatureContext.violation_system_version ?? null,
    summary_hash: input.signatureContext.summary_hash ?? null,
    memory_hash: input.signatureContext.memory_hash ?? null,
    summary_source: input.signatureContext.summary_source ?? null,
    summary_generation_timestamp: input.signatureContext.summary_generation_timestamp ?? null,
    summary_model: input.signatureContext.summary_model ?? null,
    summary_version: input.signatureContext.summary_version ?? null,
    chunk_size: input.signatureContext.chunk_size ?? null,
    overlap_size: input.signatureContext.overlap_size ?? null,
    total_chunks: input.signatureContext.total_chunks ?? null,
    total_detection_passes: input.signatureContext.total_detection_passes ?? null,
    diagnostics_enabled: input.signatureContext.diagnostics_enabled ?? null,
    lineage_enabled: input.signatureContext.lineage_enabled ?? null,
    system_prompt_hash: sha256(input.systemPrompt),
    user_prompt_hash: sha256(input.userPrompt),
    combined_prompt_hash: sha256(
      canonicalStringify({
        system_prompt: input.systemPrompt,
        user_prompt: input.userPrompt,
      }),
    ),
  };
}

function computeExecutionSignatureHash(row: ReturnType<typeof buildExecutionSignatureRow>): string {
  return sha256(canonicalStringify(row));
}

function estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
  return Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
}

export async function runV3RuntimeAdapter(
  input: V3RuntimeAdapterRequest,
  options: V3RuntimeAdapterOptions = {},
): Promise<V3RuntimeAdapterResult> {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: runV3RuntimeAdapter", {
    jobId: input.jobId,
    chunkId: input.chunkId,
  });
  const analysisRequest = buildRuntimeAnalysisRequest(input, options);
  const promptInput = buildPromptInput(analysisRequest);
  const renderedPrompt = buildV3RenderedPrompt(promptInput);
  const userPrompt = buildV3ProviderUserPrompt(promptInput);
  let promptAuditFilePath: string | null = null;
  if (config.V3_DIAGNOSTIC_MODE) {
    try {
      promptAuditFilePath = await writePromptAuditFile({
        jobId: input.jobId,
        chunkId: input.chunkId,
        promptHash: renderedPrompt.promptHash,
        modelName: options.modelName ?? config.OPENAI_JUDGE_MODEL,
        systemPrompt: renderedPrompt.prompt,
        userPrompt,
        promptInput,
      });
    } catch (error) {
      logger.warn("V3 prompt audit write failed", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
  }

  const providerFactory = createV3ProviderFactory();
  const provider = providerFactory.create(options.providerName ?? "openai");
  const modelName = options.modelName ?? config.OPENAI_JUDGE_MODEL;
  const temperature = options.temperature ?? (config.DETERMINISTIC_MODE ? 0 : 0.4);
  const topP = options.topP ?? 1;
  const seed = options.seed ?? (config.DETERMINISTIC_MODE ? 12345 : undefined);
  const maxTokens = options.maxTokens ?? 4096;
  const responseFormat = options.responseFormat ?? "json_object";
  const pipelineVersion = input.analysisSignatureContext?.pipeline_version ?? config.ANALYSIS_PIPELINE_VERSION;

  const signatureContext = input.analysisSignatureContext ?? null;
  let executionSignatureHash: string | null = null;
  if (signatureContext) {
    const signatureRow = buildExecutionSignatureRow({
      signatureContext,
      providerName: provider.name,
      modelName,
      temperature,
      topP,
      seed: typeof seed === "number" ? seed : null,
      maxTokens,
      responseFormat,
      systemPrompt: renderedPrompt.prompt,
      userPrompt,
    });
    executionSignatureHash = computeExecutionSignatureHash(signatureRow);
    logger.info("V3 instrumentation ENTER: persistAnalysisExecutionSignature", {
      jobId: input.jobId,
      chunkId: input.chunkId,
    });
    await persistAnalysisExecutionSignature(signatureContext, renderedPrompt.prompt, userPrompt);
    logger.info("V3 instrumentation EXIT: persistAnalysisExecutionSignature", {
      jobId: input.jobId,
      chunkId: input.chunkId,
      durationMs: Date.now() - startedAt,
    });
  }

  const reasoningStartedAt = Date.now();
  const rawResponse = await provider.callJudgeRaw({
    systemPrompt: renderedPrompt.prompt,
    userPrompt,
    modelName,
    temperature,
    topP,
    seed,
    maxTokens,
    promptTokenEstimate: estimatePromptTokens(renderedPrompt.prompt, userPrompt),
    retryAttempt: 0,
    responseFormat,
  });
  const reasoningLatencyMs = Date.now() - reasoningStartedAt;

  const mapped = mapV3ProviderResponse(rawResponse.rawResponse);
  const groundingValidation = validateReasonedDecisionAgainstEvidence(promptInput, {
    prompt: renderedPrompt.prompt,
    promptHash: renderedPrompt.promptHash,
    userPrompt,
    rawResponse,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    reasonedDecision: mapped.reasonedDecision,
  });
  const validatedReasonedDecision = groundingValidation.valid ? mapped.reasonedDecision : groundingValidation.sanitizedDecision;
  logger.info("V3 reviewer grounding validation", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    valid: groundingValidation.valid,
    issueCount: groundingValidation.issues.length,
    validationNote: groundingValidation.validationNote,
  });
  const gptAssistant = Object.freeze({
    providerName: rawResponse.providerName,
    modelName: rawResponse.modelName,
    promptHash: renderedPrompt.promptHash,
    responseHash: sha256(rawResponse.rawResponse),
    latencyMs: reasoningLatencyMs,
    reasoning: validatedReasonedDecision.reasoning,
    alternativeInterpretations: [...validatedReasonedDecision.alternativeInterpretations],
    confidence: validatedReasonedDecision.confidence,
    supportingEvidence: [...validatedReasonedDecision.supportingEvidence],
    contradictingEvidence: [...validatedReasonedDecision.contradictingEvidence],
    applicableArticles: [...validatedReasonedDecision.applicableArticles],
    rejectedArticles: [...validatedReasonedDecision.rejectedArticles],
    riskAnalysis: validatedReasonedDecision.riskAnalysis,
    narrativeAnalysis: validatedReasonedDecision.narrativeAnalysis,
    humanLikeExplanation: validatedReasonedDecision.humanLikeExplanation,
    recommendation: validatedReasonedDecision.recommendation,
  });
  const intelligence = buildIntelligenceContext({
    moduleId: analysisRequest.subjectModule.id,
    storyMemory: analysisRequest.storyMemory,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    glossary: analysisRequest.glossary,
  });
  const reviewerConceptContext = createPromptConceptContext(promptInput);
  const reviewerAssessment = runReviewerMethodology({
    promptInput,
    conceptContext: reviewerConceptContext,
  });
  const reviewerKnowledgeSelection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput,
    conceptContext: reviewerConceptContext,
    assessment: reviewerAssessment,
  });
  const reviewerKnowledgeRetrieval = createReviewerKnowledgeRetrievalReport({
    assessment: reviewerAssessment,
    conceptContext: reviewerConceptContext,
    subjectModule: analysisRequest.subjectModule,
    registry: reviewerKnowledgeSelection.reviewerKnowledgeRegistry,
    topK: Math.max(1, reviewerKnowledgeSelection.routing.selectedReviewerPackIds.length),
  });
  const reviewerKnowledgePacks = reviewerKnowledgeRetrieval.selectedPacks;
  const reviewerReasoningEngine = buildReviewerReasoningEnginePayload(
    promptInput,
    reviewerConceptContext,
    reviewerAssessment,
    reviewerKnowledgePacks,
    reviewerKnowledgeSelection.knowledgeRegistry,
    reviewerKnowledgeRetrieval,
  );
  logger.info("V3 reviewer routing", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    selectedReviewers: [...reviewerKnowledgeSelection.routing.selectedReviewerLabels],
    rejectedReviewers: [...reviewerKnowledgeSelection.routing.rejectedReviewerLabels],
    selectedReviewerIds: [...reviewerKnowledgeSelection.routing.selectedReviewerIds],
    rejectedReviewerIds: [...reviewerKnowledgeSelection.routing.rejectedReviewerIds],
    knowledgeReductionPercent: reviewerKnowledgeSelection.routing.knowledgeReductionPercent,
    routingConfidence: reviewerKnowledgeSelection.routing.routingConfidence,
  });
  const reviewerDecision = buildReviewerDecisionContext({
    intelligence,
    reviewerReasoningEngine,
    reviewerAssessment,
    conceptContext: reviewerConceptContext,
    reasonedDecision: validatedReasonedDecision,
    subjectModuleArticleIds: analysisRequest.subjectModule.articleIds ?? [],
  });
  const legalModuleRegistry = new LegalModuleRegistry()
    .register(PROFANITY_MODULE)
    .register(RELIGION_MODULE)
    .register(STATE_LEADERSHIP_MODULE)
    .register(NATIONAL_SECURITY_MODULE)
    .register(CHILDREN_MODULE)
    .register(VIOLENCE_MODULE)
    .register(SEXUALITY_MODULE)
    .register(DRUGS_MODULE)
    .register(SOCIETY_MODULE)
    .register(FAMILY_VALUES_MODULE)
    .register(HISTORY_MODULE)
    .register(POLITICS_MODULE)
    .register(CRIME_MODULE)
    .register(TRAVEL_MODULE);
  const legalModules = legalModuleRegistry.list();
  const legalEngine = createLegalEngine(
    createLegalModuleLoader(legalModuleRegistry),
  );
  const legalDecision = legalEngine.evaluate({
    moduleId: analysisRequest.subjectModule.id,
    intelligence,
    reviewerDecision,
  });
  const scopeValidation = validateReviewerScope({
    routing: reviewerKnowledgeSelection.routing,
    decision: legalDecision,
  });
  logger.info("V3 reviewer scope validation", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    selectedReviewers: [...scopeValidation.selectedReviewerLabels],
    rejectedReviewers: [...scopeValidation.rejectedReviewerLabels],
    rejectedFindingsByScope: scopeValidation.rejectedFindingsByScopeCount,
    acceptedFindings: scopeValidation.acceptedFindingsCount,
    scopeReason: scopeValidation.scopeReason,
  });
  const validatedLegalDecision = scopeValidation.sanitizedDecision;
  const gcamMapping = evaluateRuntimeGcamMapping(validatedLegalDecision, intelligence);

  const intelligenceHash = sha256(canonicalStringify(intelligence));
  const semanticHash = sha256(canonicalStringify(mapped.semantic));
  const legalHash = sha256(canonicalStringify(validatedLegalDecision));
  const stageHashes = [
    { stage: "narrative" as const, hash: sha256(canonicalStringify(mapped.narrative)) },
    { stage: "evidence" as const, hash: sha256(canonicalStringify(mapped.evidence)) },
    { stage: "semantic" as const, hash: semanticHash },
    { stage: "context" as const, hash: sha256(canonicalStringify(mapped.context)) },
    { stage: "intelligence" as const, hash: intelligenceHash },
    { stage: "legal" as const, hash: legalHash },
  ];
  const frozenStageHashes = Object.freeze(stageHashes.map((stage) => Object.freeze({ ...stage }))) as readonly V3StageHash[];
  const frozenStageTimings = Object.freeze(
    stageHashes.map((stage) => Object.freeze({ stage: stage.stage, durationMs: null as number | null })),
  ) as readonly V3StageTiming[];

  const analysisResponse: AnalysisResponse = Object.freeze({
    promptHash: renderedPrompt.promptHash,
    semanticHash,
    legalHash,
    stageHashes: frozenStageHashes,
    stageTimings: frozenStageTimings,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    intelligence,
    legalDecision: validatedLegalDecision,
    diagnostics: Object.freeze({
      executionOrder: ["build_prompt", "reasoning_pipeline", "semantic_layer", "intelligence_layer", "legal_engine", "module_evaluation", "analysis_response"] as const,
      promptHash: renderedPrompt.promptHash,
      semanticHash,
      legalHash,
      stageHashes: frozenStageHashes,
      stageTimings: frozenStageTimings,
    }),
  });

  const diagnostics = createV3RuntimeDiagnostics({
    analysisResponse,
    providerName: rawResponse.providerName,
    modelName: rawResponse.modelName,
    modelVersion: rawResponse.modelVersion,
    rawResponseHash: sha256(rawResponse.rawResponse),
    responseId: rawResponse.responseId,
    responseTimestamp: rawResponse.responseTimestamp,
    promptHash: analysisResponse.promptHash,
    executionSignatureHash,
    subjectModuleId: analysisRequest.subjectModule.id,
    chunkText: analysisRequest.chunk.text,
    findingCount: validatedLegalDecision.finding ? 1 : 0,
  });
  const findings = mapLegalDecisionToFindings({
    decision: validatedLegalDecision,
    chunkStart: input.chunkStart,
    chunkEnd: input.chunkEnd,
    startLine: input.startLine,
    endLine: input.endLine,
    diagnostics,
    gcamMapping,
  });
  const reviewerCompiledContext = promptInput.compiledReviewerContext ?? null;
  const candidateDiagnostics = reviewerCompiledContext?.candidateDiagnostics ?? null;
  const evidenceTrace = config.V3_DIAGNOSTIC_MODE
    ? buildEvidenceTrace({
        originalChunkText: analysisRequest.chunk.text,
        promptAuditFilePath,
        analysisRequest,
        promptInput,
        renderedPrompt,
        userPrompt,
        rawResponse,
        mapped,
        groundingValidation,
        scopeValidation,
        findings,
        validatedLegalDecision,
        gcamMapping,
        reviewerKnowledgeSelection,
        reviewerKnowledgeRetrieval,
        reviewerCompiledContext,
        candidateDiagnostics,
      })
    : null;
  const diagnosticReport = config.V3_DIAGNOSTIC_MODE
    ? buildV3DiagnosticReport({
        providerDecision: mapped.reasonedDecision,
        groundingValidation,
        scopeValidation,
        validatedDecision: validatedLegalDecision,
        mapperFindings: findings,
        evidenceTrace,
      })
    : null;
  const truthLayerMeta = buildRuntimeTruthLayerMeta({
    analysisResponse,
    findings,
    diagnostics,
    gptAssistant,
  });
  if (diagnosticReport) {
    truthLayerMeta.v3_diagnostic_report = diagnosticReport;
  }
  const reviewerDebate = buildReviewerDebatePackage({
    analysisResponse,
    legalModules,
    reviewerReasoningEngine,
    gptAssistant,
  });
  const arbitrationStartedAt = Date.now();
  const arbitration = Object.freeze({
    ...buildArbitrationDecisionPackage({
      debate: reviewerDebate,
    }),
    decisionDurationMs: Date.now() - arbitrationStartedAt,
  });
  const explanation = buildExplanationPackage({
    jobId: input.jobId,
    chunkId: input.chunkId,
    pipelineVersion,
    analysisResponse: buildExplanationSafeAnalysisResponse(analysisResponse),
    findings,
    reviewerDebate,
    arbitration,
    diagnostics,
  });
  const legalReasoningTrace = buildV3LegalReasoningTrace({
    jobId: input.jobId,
    chunkId: input.chunkId,
    findingKey: buildV3InspectionChunkFindingKey(input.jobId, input.chunkId),
    analysisResponse,
    findings,
    promptInput,
    renderedPrompt,
    userPrompt,
    rawResponse,
    groundingValidation,
    scopeValidation,
    reviewerKnowledgeSelection,
    reviewerKnowledgeRetrieval,
    reviewerCompiledContext: promptInput.compiledReviewerContext ?? null,
    candidateDiagnostics: promptInput.compiledReviewerContext?.candidateDiagnostics ?? null,
    reviewerDecision,
    legalDecision,
    validatedLegalDecision,
    gcamMapping,
    reviewerDebate,
    arbitration,
    explanation,
    diagnostics,
  });
  const legalReasoningMetrics = buildV3ReasoningMetrics(legalReasoningTrace);

  if (config.V3_INSPECTION_MODE) {
    try {
      const inspectionTimestamp = new Date().toISOString();
      const knowledgeRegistry = reviewerKnowledgeSelection.knowledgeRegistry;
      const routing = reviewerKnowledgeSelection.routing;
      const reasoningTraces = buildV3ReasoningTrace({
        analysisResponse,
        findings,
      });
      const primaryTrace = reasoningTraces[0] ?? null;
      const traceStageMap = new Map(primaryTrace?.stages.map((stage) => [stage.stage, stage] as const) ?? []);
      const findingKey = buildV3InspectionChunkFindingKey(input.jobId, input.chunkId);
      const semanticCandidates = analysisResponse.evidence.candidates.map((candidate, index) => ({
        index,
        text: candidate.text,
        start_offset: candidate.startOffset,
        end_offset: candidate.endOffset,
        confidence: candidate.confidence,
        source: candidate.source,
      }));
      const semanticRecord = buildV3SemanticGenerationInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        provider: rawResponse.providerName,
        model: rawResponse.modelName,
        promptHash: renderedPrompt.promptHash,
        semanticHash,
        semanticOutput: analysisResponse.semantic as unknown as Record<string, unknown>,
        semanticConfidence: analysisResponse.semantic.confidence,
        concepts: [...analysisResponse.intelligence.conceptContext.conceptIds],
        entities: [...analysisResponse.intelligence.entities],
        sceneInformation: {
          scene_type: analysisResponse.narrative.sceneType,
          story_position: analysisResponse.narrative.storyPosition,
          dialogue_mode: analysisResponse.intelligence.dialogueMode,
          interpretation_mode: analysisResponse.intelligence.interpretationMode,
        },
        candidateCount: semanticCandidates.length,
        candidateIds: semanticCandidates.map((candidate) => String(candidate.index)),
        candidates: semanticCandidates,
        stageTimings: analysisResponse.diagnostics.stageTimings as readonly unknown[],
      });
      const knowledgeRegistryRecord = buildV3KnowledgeRegistryInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        registry: knowledgeRegistry,
        stageTimings: analysisResponse.diagnostics.stageTimings as readonly unknown[],
      });
      const knowledgeRanking = createKnowledgeRankingReport({
        jobId: input.jobId,
        chunkId: input.chunkId,
        analysisEngine: "v3",
        pipelineVersion,
        chunkText: input.chunkText,
        analysisPromptContext: input.analysisPromptContext ?? null,
        storyMemory: analysisRequest.storyMemory,
        sceneMemory: analysisRequest.sceneMemory,
        neighboringSentences: input.neighboringSentences,
        subjectModule: analysisRequest.subjectModule,
        analysisRequest,
        analysisResponse,
        registry: knowledgeRegistry,
      });
      const knowledgeRankingRecord = buildV3KnowledgeRankingInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        ranking: knowledgeRanking,
        stageTimings: analysisResponse.diagnostics.stageTimings as readonly unknown[],
      });
      const knowledgeAssetsUsed = Object.freeze([
        ...new Set([
          ...((primaryTrace?.stages.flatMap((stage) => stage.items) ?? []) as readonly string[]),
          ...((traceStageMap.get("applicable_lessons")?.items ?? []) as readonly string[]),
          ...((traceStageMap.get("applicable_pattern_libraries")?.items ?? []) as readonly string[]),
          ...((traceStageMap.get("applicable_knowledge_packs")?.items ?? []) as readonly string[]),
        ]),
      ]);
      const knowledgeRecord = buildV3KnowledgeMatchingInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        reviewerModule: {
          id: analysisRequest.subjectModule.id,
          title_ar: analysisRequest.subjectModule.titleAr,
          scope: analysisRequest.subjectModule.scope ?? null,
          rules: [...(analysisRequest.subjectModule.rules ?? [])],
          exclusions: [...(analysisRequest.subjectModule.exclusions ?? [])],
          required_evidence: [...(analysisRequest.subjectModule.requiredEvidence ?? [])],
          decision_tree: [...(analysisRequest.subjectModule.decisionTree ?? [])],
          examples: [...(analysisRequest.subjectModule.examples ?? [])],
          non_examples: [...(analysisRequest.subjectModule.nonExamples ?? [])],
          article_ids: [...(analysisRequest.subjectModule.articleIds ?? [])],
          notes: [...(analysisRequest.subjectModule.notes ?? [])],
        },
        reviewerDomainsLoaded: [...routing.selectedReviewerIds],
        selectedReviewers: [...routing.selectedReviewerLabels],
        selectedReviewerPackIds: [...routing.selectedReviewerPackIds],
        rejectedReviewers: [...routing.rejectedReviewerLabels],
        loadedAcademyCount: routing.loadedAcademyCount,
        skippedAcademyCount: routing.skippedAcademyCount,
        knowledgeReductionPercent: routing.knowledgeReductionPercent,
        routingConfidence: routing.routingConfidence,
        routingReason: routing.routingReason,
        knowledgeRetrieval: {
          queryTerms: [...reviewerKnowledgeRetrieval.queryTerms],
          topK: reviewerKnowledgeRetrieval.topK,
          knowledgeScore: reviewerKnowledgeRetrieval.knowledgeScore,
          knowledgeConfidence: reviewerKnowledgeRetrieval.knowledgeConfidence,
          knowledgeSource: reviewerKnowledgeRetrieval.knowledgeSource,
          cacheKey: reviewerKnowledgeRetrieval.cacheKey,
          cacheHit: reviewerKnowledgeRetrieval.cacheHit,
          retrievedPacks: reviewerKnowledgeRetrieval.retrievedPacks.map((item) => ({
            id: item.id,
            title: item.title,
            moduleId: item.moduleId,
            score: item.score,
            confidence: item.confidence,
            reasons: [...item.reasons],
            source: [...item.source],
            triggerConceptIds: [...item.triggerConceptIds],
            articleIds: [...item.articleIds],
            selected: item.selected,
          })),
          rejectedPacks: reviewerKnowledgeRetrieval.rejectedPacks.map((item) => ({
            id: item.id,
            title: item.title,
            moduleId: item.moduleId,
            score: item.score,
            confidence: item.confidence,
            reasons: [...item.reasons],
            source: [...item.source],
            triggerConceptIds: [...item.triggerConceptIds],
            articleIds: [...item.articleIds],
            selected: item.selected,
          })),
        },
        decisionMemoryRetrieval: reviewerKnowledgeRetrieval.decisionMemoryRetrieval,
        knowledgeAssetsUsed,
        storyMemory: analysisRequest.storyMemory,
        scriptMemory: input.analysisPromptContext ?? null,
        sceneMemory: analysisRequest.sceneMemory,
        lessonsUsed: [...(traceStageMap.get("applicable_lessons")?.items ?? [])],
        patternLibrariesUsed: [...(traceStageMap.get("applicable_pattern_libraries")?.items ?? [])],
        knowledgePacksUsed: [...(traceStageMap.get("applicable_knowledge_packs")?.items ?? [])],
        reviewQuestions: [...(traceStageMap.get("reviewer_questions")?.items ?? [])],
        matchedConcepts: [...(traceStageMap.get("detected_concepts")?.items ?? analysisResponse.intelligence.conceptContext.conceptIds ?? [])],
        matchedEvidence: [...(traceStageMap.get("supporting_evidence")?.items ?? analysisResponse.legalDecision.evidence.candidates.map((candidate) => candidate.text))],
        evidenceAssessment: analysisResponse.intelligence.evidenceAssessment as unknown as Record<string, unknown>,
        context: analysisResponse.context as unknown as Record<string, unknown>,
        conceptContext: analysisResponse.intelligence.conceptContext as unknown as Record<string, unknown>,
        legalConcepts: [...(analysisResponse.intelligence.legalConcepts ?? [])] as readonly unknown[],
        flags: analysisResponse.intelligence.flags as unknown as Record<string, unknown>,
        reasoningTrace: primaryTrace as unknown as Record<string, unknown> | null,
      });
      const legalRecord = buildV3LegalReviewInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        moduleId: validatedLegalDecision.moduleId,
        moduleTitle: validatedLegalDecision.moduleTitle,
        status: validatedLegalDecision.status,
        reason: validatedLegalDecision.reason,
        confidence: validatedLegalDecision.confidence,
        articleIds: [...validatedLegalDecision.articleIds],
        finding: validatedLegalDecision.finding as unknown as Record<string, unknown> | null,
        exceptions: [...validatedLegalDecision.exceptions] as readonly unknown[],
        trace: [...validatedLegalDecision.trace] as readonly unknown[],
        candidateCount: semanticCandidates.length,
        acceptedCount: validatedLegalDecision.finding ? 1 : 0,
        rejectedCount: validatedLegalDecision.status === "reject" ? 1 : 0,
        needsReviewCount: validatedLegalDecision.status === "needs_review" ? 1 : 0,
      });
      const debateRecord = buildV3ReviewerDebateInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        debate: reviewerDebate,
      });
      const arbitrationRecord = buildV3ArbitrationInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        arbitration,
      });
      const mappingRecord = buildV3FindingMapperInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        inputDecision: validatedLegalDecision as unknown as Record<string, unknown>,
        outputFindings: findings as readonly unknown[],
        articleMapping: gcamMapping as unknown as Record<string, unknown>,
        confidence: gcamMapping.confidence,
        title: gcamMapping.findingTitle,
        description: gcamMapping.reviewerExplanation,
        evidenceSnippet: findings[0]?.evidence_snippet ?? validatedLegalDecision.finding?.evidence.text ?? null,
        articleIds: findings.map((findingItem) => findingItem.article_id),
        atomIds: findings.flatMap((findingItem) => (findingItem.atom_id ? [findingItem.atom_id] : [])),
        legalModule: validatedLegalDecision.moduleId,
        legalModuleTitle: validatedLegalDecision.moduleTitle,
        mappedCount: findings.length,
        droppedCount: Math.max(0, (validatedLegalDecision.finding ? 1 : 0) - findings.length),
      });
      const explanationRecord = buildV3ExplanationInspectionRecord({
        base: {
          jobId: input.jobId,
          chunkId: input.chunkId,
          findingKey,
          createdAt: inspectionTimestamp,
        },
        analysisEngine: "v3",
        pipelineVersion,
        explanation,
      });
      logger.info("V3 instrumentation ENTER: first inspection write batch", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        recordCount: 9,
      });
      await v3InspectionRecorder.recordStages([
        knowledgeRegistryRecord,
        knowledgeRankingRecord,
        semanticRecord,
        knowledgeRecord,
        legalRecord,
        debateRecord,
        arbitrationRecord,
        mappingRecord,
        explanationRecord,
      ]);
      logger.info("V3 instrumentation EXIT: first inspection write batch", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logger.warn("V3 inspection capture failed", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
  }

  const result = Object.freeze({
    analysisResponse,
    findings,
    diagnostics,
      truthLayerMeta: Object.freeze({
      ...truthLayerMeta,
      explanation,
      legal_reasoning_trace: legalReasoningTrace,
      legal_reasoning_metrics: legalReasoningMetrics,
        gcam_mapping: Object.freeze({
        status: gcamMapping.status,
        articleId: gcamMapping.articleId,
        articleNumber: gcamMapping.articleNumber,
        articleTitleAr: gcamMapping.articleTitleAr,
        atomId: gcamMapping.atomId,
        atomNumber: gcamMapping.atomNumber,
        atomTitleAr: gcamMapping.atomTitleAr,
        findingTitle: gcamMapping.findingTitle,
        findingCategory: gcamMapping.findingCategory,
        reviewerExplanation: gcamMapping.reviewerExplanation,
        supportingEvidence: [...gcamMapping.supportingEvidence],
        matchedRuleId: gcamMapping.matchedRuleId,
        matchedArticleMappingId: gcamMapping.matchedArticleMappingId,
        matchedAtomMappingId: gcamMapping.matchedAtomMappingId,
        confidence: gcamMapping.confidence,
        mappingDebt: [...gcamMapping.mappingDebt],
        hash: gcamMapping.hash,
      }),
    }),
  });
  logger.info("V3 instrumentation EXIT: runV3RuntimeAdapter", {
    jobId: input.jobId,
    chunkId: input.chunkId,
    durationMs: Date.now() - startedAt,
  });
  return result;
}
