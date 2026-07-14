import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { createDefaultAnalysisEngineConfig } from "../engine/analysisConfig.js";
import type { AnalysisRequest } from "../engine/analysisRequest.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import { buildV3ProviderUserPrompt } from "../provider/provider.js";
import { createV3ProviderFactory } from "../provider/providerFactory.js";
import { mapV3ProviderResponse } from "../provider/responseMapper.js";
import { buildIntelligenceContext } from "../intelligence/intelligenceBuilder.js";
import { PROFANITY_MODULE } from "../legal/modules/profanity/profanityModule.js";
import { createLegalEngine } from "../legal/legalEngine.js";
import { createLegalModuleLoader } from "../legal/legalModuleLoader.js";
import { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";
import type { V3PromptGlossary, V3PromptOutputSchema, V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { V3RuntimeAdapterRequest, V3RuntimeAdapterOptions, V3RuntimeAdapterResult } from "./runtimeTypes.js";
import { createV3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import { buildRuntimeTruthLayerMeta } from "./reportMapper.js";
import { evaluateRuntimeGcamMapping, mapLegalDecisionToFindings } from "./findingMapper.js";
import { canonicalStringify } from "../../canonicalJson.js";
import { sha256 } from "../../hash.js";
import { persistAnalysisExecutionSignature, type AnalysisExecutionSignatureInput } from "../../executionSignature.js";
import { config } from "../../config.js";
import { toPromptBuilderInput } from "../engine/analysisRequest.js";
import type { V3StageHash, V3StageTiming } from "../pipeline/pipelineTypes.js";

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
  return module;
}

function defaultOutputSchema(): V3PromptOutputSchema {
  return {
    title: "V3 Runtime Output Contract",
    fields: [
      { name: "narrative", description: "Narrative result", required: true },
      { name: "evidence", description: "Evidence result", required: true },
      { name: "semantic", description: "Semantic result", required: true },
      { name: "context", description: "Context result", required: true },
    ],
    notes: ["Response is mapped into the existing V2 finding model after legal evaluation."],
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

export async function runV3RuntimeAdapter(
  input: V3RuntimeAdapterRequest,
  options: V3RuntimeAdapterOptions = {},
): Promise<V3RuntimeAdapterResult> {
  const analysisRequest = buildRuntimeAnalysisRequest(input, options);
  const promptInput = buildPromptInput(analysisRequest);
  const renderedPrompt = buildV3RenderedPrompt(promptInput);
  const userPrompt = buildV3ProviderUserPrompt(promptInput);

  const providerFactory = createV3ProviderFactory();
  const provider = providerFactory.create(options.providerName ?? "openai");
  const modelName = options.modelName ?? config.OPENAI_JUDGE_MODEL;
  const temperature = options.temperature ?? (config.DETERMINISTIC_MODE ? 0 : 0.4);
  const topP = options.topP ?? 1;
  const seed = options.seed ?? (config.DETERMINISTIC_MODE ? 12345 : undefined);
  const maxTokens = options.maxTokens ?? 4096;
  const responseFormat = options.responseFormat ?? "json_object";

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
    await persistAnalysisExecutionSignature(signatureContext, renderedPrompt.prompt, userPrompt);
  }

  const rawResponse = await provider.callJudgeRaw({
    systemPrompt: renderedPrompt.prompt,
    userPrompt,
    modelName,
    temperature,
    topP,
    seed,
    maxTokens,
    responseFormat,
  });

  const mapped = mapV3ProviderResponse(rawResponse.rawResponse);
  const intelligence = buildIntelligenceContext({
    moduleId: analysisRequest.subjectModule.id,
    storyMemory: analysisRequest.storyMemory,
    narrative: mapped.narrative,
    evidence: mapped.evidence,
    semantic: mapped.semantic,
    context: mapped.context,
    glossary: analysisRequest.glossary,
  });
  const legalEngine = createLegalEngine(createLegalModuleLoader(new LegalModuleRegistry().register(PROFANITY_MODULE)));
  const legalDecision = legalEngine.evaluate({
    moduleId: analysisRequest.subjectModule.id,
    intelligence,
  });
  const gcamMapping = evaluateRuntimeGcamMapping(legalDecision, intelligence);

  const intelligenceHash = sha256(canonicalStringify(intelligence));
  const semanticHash = sha256(canonicalStringify(mapped.semantic));
  const legalHash = sha256(canonicalStringify(legalDecision));
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
    legalDecision,
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
    findingCount: legalDecision.finding ? 1 : 0,
  });
  const findings = mapLegalDecisionToFindings({
    decision: legalDecision,
    chunkStart: input.chunkStart,
    chunkEnd: input.chunkEnd,
    startLine: input.startLine,
    endLine: input.endLine,
    diagnostics,
    gcamMapping,
  });
  const truthLayerMeta = buildRuntimeTruthLayerMeta({
    analysisResponse,
    findings,
    diagnostics,
  });

  return Object.freeze({
    analysisResponse,
    findings,
    diagnostics,
    truthLayerMeta: Object.freeze({
      ...truthLayerMeta,
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
}
