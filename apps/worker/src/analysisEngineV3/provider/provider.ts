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
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { compileReviewerContext } from "../reviewerCompiler/compiler.js";
import { validateReasonedDecisionAgainstEvidence } from "./reasonedDecisionValidation.js";
import { logger } from "../../logger.js";
import { config } from "../../config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

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
  const reviewerKnowledgeRetrieval = useReviewerCompiler
    ? null
    : createReviewerKnowledgeRetrievalReport({
        assessment: reviewerAssessment,
        conceptContext,
        subjectModule: input.subjectModule,
        registry: reviewerKnowledgeSelection!.reviewerKnowledgeRegistry,
        topK: Math.max(1, reviewerKnowledgeSelection!.routing.selectedReviewerPackIds.length),
      });
  const reviewerKnowledgePacks = reviewerKnowledgeRetrieval?.selectedPacks ?? [];
  const reviewerReasoningEngine = useReviewerCompiler
    ? null
    : buildReviewerReasoningEnginePayload(
        input,
        conceptContext,
        reviewerAssessment,
        reviewerKnowledgePacks,
        reviewerKnowledgeSelection!.knowledgeRegistry,
        reviewerKnowledgeRetrieval!,
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
    "- If no article passes, return NO VIOLATION.",
    "- Do not add facts, actors, objects, injuries, or events not present in the source evidence.",
    "Validation issues:",
    issueLines,
  ].join("\n");
}

function estimatePromptTokens(systemPrompt: string, userPrompt: string): number {
  return Math.max(1, Math.ceil((systemPrompt.length + userPrompt.length) / 4));
}

async function writePromptAuditFile(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  systemPrompt: string;
  userPrompt: string;
  promptHash: string;
  modelName: string;
}>): Promise<void> {
  const compiledReviewerContext = input.promptInput.compiledReviewerContext ?? null;
  const candidateReviewers = compiledReviewerContext?.selection.selectedReviewerLabels ?? [];
  const candidateReviewerIds = compiledReviewerContext?.selection.selectedReviewerIds ?? [];
  const candidateArticles = (compiledReviewerContext?.selectedArticles ?? []).map((article) => ({
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
  }));
  const candidateAtoms = (compiledReviewerContext?.selectedAtoms ?? []).map((atom) => ({
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
  }));
  const evidenceExcerpts = [
    input.promptInput.chunkContext.localChunk,
    ...(input.promptInput.chunkContext.neighboringSentences ?? []),
    input.promptInput.chunkContext.sceneMemory ?? "",
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  const promptTokenEstimate = estimatePromptTokens(input.systemPrompt, input.userPrompt);
  const auditRecord = {
    createdAt: new Date().toISOString(),
    modelName: input.modelName,
    promptHash: input.promptHash,
    promptLengthChars: input.systemPrompt.length + input.userPrompt.length,
    promptTokenEstimate,
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    candidateReviewers,
    candidateReviewerIds,
    candidateArticles,
    candidateAtoms,
    evidenceExcerpts,
    reviewerInstructions: {
      reasoningContract: input.promptInput.reasoningContract,
      decisionGraph: input.promptInput.decisionGraph,
      semanticLayer: input.promptInput.semanticLayer,
      subjectModule: input.promptInput.subjectModule,
    },
    universalInstructions: {
      reviewerMethodology: getDefaultReviewerMethodology(),
      reviewerQuestionSet: getDefaultReviewerQuestionSet(),
    },
    exceptionRules: {
      outputSchemaNotes: input.promptInput.outputSchema.notes ?? [],
      outputSchemaTitle: input.promptInput.outputSchema.title,
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
          selectedArticles: candidateArticles,
          selectedAtoms: candidateAtoms,
        }
      : null,
  };

  const auditDir = join(tmpdir(), "raawifilm-v3-prompt-audits");
  const auditPath = join(auditDir, `prompt-audit-${input.promptHash.slice(0, 16)}-${Date.now()}.json`);

  await mkdir(auditDir, { recursive: true });
  await writeFile(auditPath, JSON.stringify(auditRecord, null, 2), "utf8");
  logger.info("V3 prompt audit written", {
    auditPath,
    promptHash: input.promptHash,
    promptLengthChars: auditRecord.promptLengthChars,
    promptTokenEstimate,
    candidateReviewerCount: candidateReviewers.length,
    candidateArticleCount: candidateArticles.length,
    candidateAtomCount: candidateAtoms.length,
  });
}

export async function runV3ProviderReasoning(input: V3ProviderFlowInput): Promise<V3ProviderReasoningResult> {
  const startedAt = Date.now();
  logger.info("V3 instrumentation ENTER: runV3ProviderReasoning", {
    modelName: input.modelName,
  });
  const renderedPrompt = buildV3RenderedPrompt(input.promptInput);
  const userPrompt = buildV3ProviderUserPrompt(input.promptInput);
  try {
    await writePromptAuditFile({
      promptInput: input.promptInput,
      systemPrompt: renderedPrompt.prompt,
      userPrompt,
      promptHash: renderedPrompt.promptHash,
      modelName: input.modelName,
    });
  } catch (error) {
    logger.warn("V3 prompt audit write failed", {
      modelName: input.modelName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? null : null,
    });
  }
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
  logger.info("V3 instrumentation ENTER: mapV3ProviderResponse", {
    modelName: input.modelName,
  });
  const mapped = mapV3ProviderResponse(rawResponse.rawResponse);
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

  if (!validation.valid) {
    const repairedUserPrompt = appendValidationRepairInstruction(userPrompt, validation.issues);
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
    logger.info("V3 instrumentation ENTER: mapV3ProviderResponse (validation retry)", {
      modelName: input.modelName,
    });
    const retryMapped = mapV3ProviderResponse(retryRawResponse.rawResponse);
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

    const retryResult = Object.freeze({
      prompt: renderedPrompt.prompt,
      promptHash: renderedPrompt.promptHash,
      userPrompt: appendValidationRepairInstruction(userPrompt, validation.issues),
      rawResponse: retryRawResponse,
      narrative: retryMapped.narrative,
      evidence: retryMapped.evidence,
      semantic: retryMapped.semantic,
      context: retryMapped.context,
      reasonedDecision: retryValidation.valid ? retryMapped.reasonedDecision : retryValidation.sanitizedDecision,
    });
    logger.info("V3 instrumentation EXIT: runV3ProviderReasoning", {
      modelName: input.modelName,
      durationMs: Date.now() - startedAt,
    });
    return retryResult;
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
  logger.info("V3 instrumentation EXIT: runV3ProviderReasoning", {
    modelName: input.modelName,
    durationMs: Date.now() - startedAt,
  });
  return result;
}

export type { V3Provider, V3ProviderName, V3ProviderRawResponse, V3ProviderReasoningRequest, V3ProviderReasoningResult } from "./providerTypes.js";
