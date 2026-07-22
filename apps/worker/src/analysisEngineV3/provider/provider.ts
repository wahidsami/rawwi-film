import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { stableSerializePromptValue } from "../builder/builderContext.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { mapV3ProviderResponse } from "./responseMapper.js";
import type {
  V3Provider,
  V3ProviderName,
  V3ProviderReasoningResult,
  V3ProviderRawResponse,
} from "./providerTypes.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { getDefaultReviewerQuestionSet } from "../reviewerQuestions/index.js";
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { createEmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { createDefaultReviewerKnowledgeRegistry, resolveKnowledgeDomainCandidateArticleIds } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledge/reviewerKnowledgeTypes.js";
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { compileReviewerContext } from "../reviewerCompiler/compiler.js";
import { validateReasonedDecisionAgainstEvidence } from "./reasonedDecisionValidation.js";
import { createV3AnalysisFailure, type V3AnalysisFailureCode } from "./analysisFailure.js";
import type { V3ProviderErrorDetails } from "./providerError.js";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { writeV3PromptReplayFile } from "../runtime/promptReplay.js";

export type V3ProviderFlowInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  provider: V3Provider;
  modelName: string;
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  signal?: AbortSignal | null;
}>;

function hasSuccessfulArticleEvaluation(reasonedDecision: { articleEvaluations: readonly { status: string }[] }): boolean {
  return reasonedDecision.articleEvaluations.some((evaluation) => evaluation.status === "PASS");
}

function createValidationFailure(
  code: V3AnalysisFailureCode,
  reason: string,
  extras?: Readonly<{
    providerError?: V3ProviderErrorDetails | null;
    parseErrors?: readonly string[];
    zeroFindingsReason?: string | null;
    validationIssues?: readonly string[];
  }>,
): Error {
  return createV3AnalysisFailure(code, reason, {
    providerError: extras?.providerError ?? null,
    parseErrors: extras?.parseErrors ?? [],
    zeroFindingsReason: extras?.zeroFindingsReason ?? null,
    validationIssues: extras?.validationIssues ?? [],
  });
}

export function createV3Provider(provider: V3Provider): V3Provider {
  return provider;
}

export function buildV3ProviderUserPrompt(input: V3PromptBuilderInput): string {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: buildV3ProviderUserPrompt", {
    subjectModuleId: input.subjectModule.id,
  });
  const useReviewerCompiler = config.REVIEWER_COMPILER_ENABLED || config.DETERMINISTIC_CANDIDATES_ENABLED;
  const conceptContext = createPromptConceptContext(input);
  const reviewerAssessment = runReviewerMethodology({ promptInput: input, conceptContext });
  const compiledReviewerContext = useReviewerCompiler
    ? (input.compiledReviewerContext ?? compileReviewerContext({
        promptInput: input,
        conceptContext,
        assessment: reviewerAssessment,
      }).compiledReviewerContext)
    : null;
  if (input.compiledReviewerContext !== compiledReviewerContext) {
    (input as V3PromptBuilderInput & { compiledReviewerContext?: typeof compiledReviewerContext | null }).compiledReviewerContext = compiledReviewerContext;
  }
  const reviewerKnowledgeSelection = useReviewerCompiler
    ? null
    : createEmergencyContextualReviewerKnowledgeSelection({
        promptInput: input,
        conceptContext,
        assessment: reviewerAssessment,
      });
  const reviewerKnowledgeRegistry = reviewerKnowledgeSelection?.reviewerKnowledgeRegistry
    ?? createDefaultReviewerKnowledgeRegistry(compiledReviewerContext?.selection.selectedAcademyFolders);
  let reviewerKnowledgeRetrieval: ReturnType<typeof createReviewerKnowledgeRetrievalReport> | null = null;
  let reviewerKnowledgePacks: readonly ReviewerKnowledgePack[] = [];
  if (!useReviewerCompiler && reviewerKnowledgeSelection) {
    reviewerKnowledgeRetrieval = createReviewerKnowledgeRetrievalReport({
      assessment: reviewerAssessment,
      conceptContext,
      subjectModule: input.subjectModule,
      registry: reviewerKnowledgeSelection.reviewerKnowledgeRegistry,
      topK: Math.max(1, reviewerKnowledgeSelection.routing.selectedReviewerPackIds.length),
    });
    reviewerKnowledgePacks = reviewerKnowledgeRetrieval.selectedPacks;
  }
  const canonicalOwnershipRegistry = reviewerKnowledgeRegistry;
  const selectedPolicyArticleIds = new Set(input.compiledReviewerContext?.selectedPolicyArticleIds ?? []);
  const resolveCanonicalArticleId = (articleId: number, knowledgeDomain: string | null): number => {
    if (!Number.isFinite(articleId) || articleId <= 0) return articleId;
    const normalizedKnowledgeDomain = typeof knowledgeDomain === "string" ? knowledgeDomain : null;
    const candidateArticleIds = normalizedKnowledgeDomain
      ? resolveKnowledgeDomainCandidateArticleIds(canonicalOwnershipRegistry, normalizedKnowledgeDomain)
      : Object.freeze([]);
    if (candidateArticleIds.includes(articleId)) return articleId;
    const selectedCandidate = candidateArticleIds.find((candidateArticleId) => selectedPolicyArticleIds.has(candidateArticleId));
    if (typeof selectedCandidate === "number") return selectedCandidate;
    return candidateArticleIds[0] ?? articleId;
  };
  const reviewerReasoningEngine = useReviewerCompiler || !reviewerKnowledgeSelection || !reviewerKnowledgeRetrieval
    ? null
    : buildReviewerReasoningEnginePayload(
        input,
        conceptContext,
        reviewerAssessment,
        reviewerKnowledgePacks,
        reviewerKnowledgeSelection.knowledgeRegistry,
        reviewerKnowledgeRetrieval,
      );
  logger.info("V3 instrumentation EXIT: buildV3ProviderUserPrompt", {
    subjectModuleId: input.subjectModule.id,
    durationMs: Date.now() - startedAt,
  });

  return stableSerializePromptValue(useReviewerCompiler && compiledReviewerContext
    ? {
        chunkContext: input.chunkContext,
        glossary: input.glossary,
        compiledReviewerContext,
        reviewerAssessment,
        reviewerMethodology: getDefaultReviewerMethodology(),
        outputSchema: input.outputSchema,
        reasoningContract: input.reasoningContract,
        semanticLayer: input.semanticLayer,
        storyMemory: input.storyMemory,
        subjectModule: {
          id: input.subjectModule.id,
          scope: input.subjectModule.scope ?? null,
          titleAr: input.subjectModule.titleAr,
        },
    }
      : {
        chunkContext: input.chunkContext,
        glossary: input.glossary,
        reviewerReasoningEngine,
        reviewerAssessment,
        reviewerMethodology: getDefaultReviewerMethodology(),
        reviewerKnowledgePacks,
        outputSchema: input.outputSchema,
        reasoningContract: input.reasoningContract,
        semanticLayer: input.semanticLayer,
        storyMemory: input.storyMemory,
        subjectModule: {
          id: input.subjectModule.id,
          scope: input.subjectModule.scope ?? null,
          titleAr: input.subjectModule.titleAr,
        },
      });
}

function appendValidationRepairInstruction(userPrompt: string, issues: readonly { path: string; message: string }[]): string {
  const issueLines = issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
  return [
    userPrompt,
    "",
    "Validation repair instruction:",
    "The previous answer failed post-generation validation.",
    "Revise only the reviewer reasoning package.",
    "Requirements:",
    "- Keep every claim grounded in the exact quoted evidence or current scene.",
    "- Evaluate every GCAM article independently and return PASS or FAIL for each one.",
    "- Preserve repeated article evaluations when separate evidence units support the same GCAM article.",
    "- Do not suppress a detection because a scene is quoted, condemnatory, educational, historical, satirical, or contextual; those exceptions are handled after generation.",
    "- Do not add facts, actors, objects, injuries, or events not present in the source evidence.",
    "Validation issues:",
    issueLines,
  ].join("\n");
}

function estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
  return Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
}

export async function runV3ProviderReasoning(input: V3ProviderFlowInput): Promise<V3ProviderReasoningResult> {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: runV3ProviderReasoning", {
    modelName: input.modelName,
  });
  const renderedPrompt = buildV3RenderedPrompt(input.promptInput);
  const userPrompt = buildV3ProviderUserPrompt(input.promptInput);
  const canonicalizationConceptContext = createPromptConceptContext(input.promptInput);
  const canonicalizationAssessment = runReviewerMethodology({
    promptInput: input.promptInput,
    conceptContext: canonicalizationConceptContext,
  });
  const canonicalizationSelection = createEmergencyContextualReviewerKnowledgeSelection({
    promptInput: input.promptInput,
    conceptContext: canonicalizationConceptContext,
    assessment: canonicalizationAssessment,
  });
  const selectedPolicyArticleIds = new Set(input.promptInput.compiledReviewerContext?.selectedPolicyArticleIds ?? []);
  const resolveCanonicalArticleId = (articleId: number, knowledgeDomain: string | null): number => {
    if (!Number.isFinite(articleId) || articleId <= 0) return articleId;
    const candidateArticleIds = typeof knowledgeDomain === "string"
      ? resolveKnowledgeDomainCandidateArticleIds(canonicalizationSelection.reviewerKnowledgeRegistry, knowledgeDomain)
      : Object.freeze([]);
    if (candidateArticleIds.includes(articleId)) return articleId;
    const selectedCandidate = candidateArticleIds.find((candidateArticleId) => selectedPolicyArticleIds.has(candidateArticleId));
    if (typeof selectedCandidate === "number") return selectedCandidate;
    return candidateArticleIds[0] ?? articleId;
  };
  logger.info("V3 instrumentation ENTER: provider.callJudgeRaw", {
    modelName: input.modelName,
  });
  const rawResponse = await input.provider.callJudgeRaw({
    systemPrompt: renderedPrompt.prompt,
    userPrompt,
    modelName: input.modelName,
    temperature: input.temperature,
    topP: input.topP,
    seed: input.seed,
    maxTokens: input.maxTokens,
    promptTokenEstimate: estimatePromptTokens(renderedPrompt.prompt, userPrompt),
    retryAttempt: 0,
    responseFormat: input.responseFormat ?? "json_object",
    signal: input.signal ?? null,
  });
  logger.info("V3 instrumentation EXIT: provider.callJudgeRaw", {
    modelName: input.modelName,
    durationMs: Date.now() - startedAt,
  });
  let firstParseErrors: readonly string[] = [];
  let firstZeroFindingsReason: string | null = null;
  logger.info("V3 instrumentation ENTER: mapV3ProviderResponse", {
    modelName: input.modelName,
  });
  const mapped = mapV3ProviderResponse(rawResponse.rawResponse, {
    resolveCanonicalArticleId,
    onAudit: (audit) => {
      firstParseErrors = audit.parseErrors;
      firstZeroFindingsReason = audit.zeroFindingsReason;
    },
  });
  logger.info("V3 instrumentation EXIT: mapV3ProviderResponse", {
    modelName: input.modelName,
    durationMs: Date.now() - startedAt,
  });
  const validation = validateReasonedDecisionAgainstEvidence(input.promptInput, {
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

  const firstHasSuccessfulEvaluation = hasSuccessfulArticleEvaluation(mapped.reasonedDecision);
  const firstParseFailed = firstParseErrors.length > 0;
  const firstNeedsRetry = !validation.valid || !firstHasSuccessfulEvaluation || firstParseFailed || Boolean(firstZeroFindingsReason);

  if (firstNeedsRetry) {
    const retryIssues =
      validation.issues.length > 0
        ? validation.issues
        : [
            {
              code: "ai.invalid_response",
              path: "reasonedDecision.articleEvaluations",
              message: "Return at least one PASS article evaluation and valid JSON.",
              severity: "error" as const,
            },
          ];
    const repairedUserPrompt = appendValidationRepairInstruction(userPrompt, retryIssues);
    logger.info("V3 instrumentation ENTER: provider.callJudgeRaw (validation retry)", {
      modelName: input.modelName,
    });
    const retryRawResponse = await input.provider.callJudgeRaw({
      systemPrompt: renderedPrompt.prompt,
      userPrompt: repairedUserPrompt,
      modelName: input.modelName,
      temperature: input.temperature,
      topP: input.topP,
      seed: input.seed,
      maxTokens: input.maxTokens,
      promptTokenEstimate: estimatePromptTokens(renderedPrompt.prompt, repairedUserPrompt),
      retryAttempt: 1,
      responseFormat: input.responseFormat ?? "json_object",
      signal: input.signal ?? null,
    });
    logger.info("V3 instrumentation EXIT: provider.callJudgeRaw (validation retry)", {
      modelName: input.modelName,
      durationMs: Date.now() - startedAt,
    });
    let retryParseErrors: readonly string[] = [];
    let retryZeroFindingsReason: string | null = null;
    logger.info("V3 instrumentation ENTER: mapV3ProviderResponse (validation retry)", {
      modelName: input.modelName,
    });
    const retryMapped = mapV3ProviderResponse(retryRawResponse.rawResponse, {
      resolveCanonicalArticleId,
      onAudit: (audit) => {
        retryParseErrors = audit.parseErrors;
        retryZeroFindingsReason = audit.zeroFindingsReason;
      },
    });
    logger.info("V3 instrumentation EXIT: mapV3ProviderResponse (validation retry)", {
      modelName: input.modelName,
      durationMs: Date.now() - startedAt,
    });
    const retryValidation = validateReasonedDecisionAgainstEvidence(input.promptInput, {
      prompt: renderedPrompt.prompt,
      promptHash: renderedPrompt.promptHash,
      userPrompt: repairedUserPrompt,
      rawResponse: retryRawResponse,
      narrative: retryMapped.narrative,
      evidence: retryMapped.evidence,
      semantic: retryMapped.semantic,
      context: retryMapped.context,
      reasonedDecision: retryMapped.reasonedDecision,
    });
    const retryHasSuccessfulEvaluation = hasSuccessfulArticleEvaluation(retryMapped.reasonedDecision);
    const retryParseFailed = retryParseErrors.length > 0;
    const retrySucceeded = retryValidation.valid && retryHasSuccessfulEvaluation && !retryParseFailed && !retryZeroFindingsReason;

    const retryResult = Object.freeze({
      prompt: renderedPrompt.prompt,
      promptHash: renderedPrompt.promptHash,
      userPrompt: repairedUserPrompt,
      rawResponse: retryRawResponse,
      narrative: retryMapped.narrative,
      evidence: retryMapped.evidence,
      semantic: retryMapped.semantic,
      context: retryMapped.context,
      reasonedDecision: retryMapped.reasonedDecision,
    });
    try {
      await writeV3PromptReplayFile({
        jobId: null,
        chunkId: null,
        promptHash: renderedPrompt.promptHash,
        modelName: input.modelName,
        chunkText: input.promptInput.chunkContext.localChunk,
        evidenceSpans: retryMapped.evidence.candidates,
        candidateReviewers: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.reviewerScores ?? [],
        candidateArticles: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.articleRanking.articleScores ?? [],
        candidateAtoms: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.atomRanking.atomScores ?? [],
        compiledReviewerContext: input.promptInput.compiledReviewerContext ?? null,
        systemPrompt: renderedPrompt.prompt,
        userPrompt: repairedUserPrompt,
        rawProviderResponse: retryRawResponse,
        parsedDecision: {
          narrative: retryMapped.narrative,
          evidence: retryMapped.evidence,
          semantic: retryMapped.semantic,
          context: retryMapped.context,
          reasonedDecision: retryMapped.reasonedDecision,
        },
      });
    } catch (error) {
      logger.warn("V3 prompt replay write failed", {
        modelName: input.modelName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }

    if (retrySucceeded) {
      logger.info("V3 instrumentation EXIT: runV3ProviderReasoning", {
        modelName: input.modelName,
        durationMs: Date.now() - startedAt,
      });
      return retryResult;
    }

    const failure = createValidationFailure(
      "AI_INVALID_RESPONSE",
      retryParseFailed || Boolean(retryZeroFindingsReason)
        ? retryZeroFindingsReason ?? "The provider response could not be parsed into a successful AI reasoning response."
        : "The provider response did not contain a successful PASS article evaluation.",
      {
        parseErrors: retryParseErrors.length > 0 ? retryParseErrors : firstParseErrors,
        zeroFindingsReason: retryZeroFindingsReason ?? firstZeroFindingsReason,
        validationIssues: retryValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      },
    );
    logger.error("AI Failure", {
      modelName: input.modelName,
      aiFailureCode: "AI_INVALID_RESPONSE",
      aiFailureReason: failure.message,
      validationIssues: retryValidation.issues.map((issue) => `${issue.path}: ${issue.message}`),
      parseErrors: retryParseErrors.length > 0 ? retryParseErrors : firstParseErrors,
    });
    logger.error("AI Failure Reason", {
      modelName: input.modelName,
      reason: failure.message,
    });
    throw failure;
  }

  const result = Object.freeze({
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
  try {
    await writeV3PromptReplayFile({
      jobId: null,
      chunkId: null,
      promptHash: renderedPrompt.promptHash,
      modelName: input.modelName,
      chunkText: input.promptInput.chunkContext.localChunk,
      evidenceSpans: mapped.evidence.candidates,
      candidateReviewers: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.reviewerScores ?? [],
      candidateArticles: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.articleRanking.articleScores ?? [],
      candidateAtoms: input.promptInput.compiledReviewerContext?.candidateDiagnostics?.atomRanking.atomScores ?? [],
      compiledReviewerContext: input.promptInput.compiledReviewerContext ?? null,
      systemPrompt: renderedPrompt.prompt,
      userPrompt,
      rawProviderResponse: rawResponse,
      parsedDecision: {
        narrative: mapped.narrative,
        evidence: mapped.evidence,
        semantic: mapped.semantic,
        context: mapped.context,
        reasonedDecision: mapped.reasonedDecision,
      },
    });
  } catch (error) {
    logger.warn("V3 prompt replay write failed", {
      modelName: input.modelName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  }
  logger.info("V3 instrumentation EXIT: runV3ProviderReasoning", {
    modelName: input.modelName,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

export type { V3Provider, V3ProviderName, V3ProviderRawResponse, V3ProviderReasoningRequest, V3ProviderReasoningResult } from "./providerTypes.js";
