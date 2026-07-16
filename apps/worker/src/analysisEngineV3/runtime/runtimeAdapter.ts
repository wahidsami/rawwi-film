import { buildV3RenderedPrompt } from "../builder/promptBuilder.js";
import { buildReviewerReasoningEnginePayload } from "../builder/reviewerReasoningEngine.js";
import { createDefaultAnalysisEngineConfig } from "../engine/analysisConfig.js";
import type { AnalysisRequest } from "../engine/analysisRequest.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import { buildV3ProviderUserPrompt } from "../provider/provider.js";
import { createV3ProviderFactory } from "../provider/providerFactory.js";
import { mapV3ProviderResponse } from "../provider/responseMapper.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
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
import { createKnowledgeRegistry, createKnowledgeRegistryFromEntries, defaultKnowledgeRegistryRoot } from "../reviewerKnowledge/knowledgeRegistry/index.js";
import { createKnowledgeRankingReport } from "../reviewerKnowledge/knowledgeRanking/index.js";
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { buildReviewerDebatePackage } from "../reviewerDebate/index.js";
import { buildArbitrationDecisionPackage } from "../arbitration/index.js";
import { buildExplanationPackage } from "../explanation/index.js";
import { buildReviewerDecisionContext } from "../legal/reviewerDecisionPreparation.js";

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
    await persistAnalysisExecutionSignature(signatureContext, renderedPrompt.prompt, userPrompt);
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
    responseFormat,
  });
  const reasoningLatencyMs = Date.now() - reasoningStartedAt;

  const mapped = mapV3ProviderResponse(rawResponse.rawResponse);
  const gptAssistant = Object.freeze({
    providerName: rawResponse.providerName,
    modelName: rawResponse.modelName,
    promptHash: renderedPrompt.promptHash,
    responseHash: sha256(rawResponse.rawResponse),
    latencyMs: reasoningLatencyMs,
    reasoning: mapped.reasonedDecision.reasoning,
    alternativeInterpretations: [...mapped.reasonedDecision.alternativeInterpretations],
    confidence: mapped.reasonedDecision.confidence,
    supportingEvidence: [...mapped.reasonedDecision.supportingEvidence],
    contradictingEvidence: [...mapped.reasonedDecision.contradictingEvidence],
    applicableArticles: [...mapped.reasonedDecision.applicableArticles],
    rejectedArticles: [...mapped.reasonedDecision.rejectedArticles],
    riskAnalysis: mapped.reasonedDecision.riskAnalysis,
    narrativeAnalysis: mapped.reasonedDecision.narrativeAnalysis,
    humanLikeExplanation: mapped.reasonedDecision.humanLikeExplanation,
    recommendation: mapped.reasonedDecision.recommendation,
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
  const reviewerKnowledgeRetrieval = createReviewerKnowledgeRetrievalReport({
    assessment: reviewerAssessment,
    conceptContext: reviewerConceptContext,
    subjectModule: analysisRequest.subjectModule,
  });
  const reviewerKnowledgePacks = reviewerKnowledgeRetrieval.selectedPacks;
  const reviewerReasoningEngine = buildReviewerReasoningEnginePayload(
    promptInput,
    reviewerConceptContext,
    reviewerAssessment,
    reviewerKnowledgePacks,
  );
  const reviewerDecision = buildReviewerDecisionContext({
    intelligence,
    reviewerReasoningEngine,
    reviewerAssessment,
    conceptContext: reviewerConceptContext,
    reasonedDecision: mapped.reasonedDecision,
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
    gptAssistant,
  });
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
    analysisResponse,
    findings,
    reviewerDebate,
    arbitration,
    diagnostics,
  });

  if (config.V3_INSPECTION_MODE) {
    try {
      const inspectionTimestamp = new Date().toISOString();
      let knowledgeRegistry;
      try {
        knowledgeRegistry = createKnowledgeRegistry();
      } catch (error) {
        logger.warn("V3 knowledge registry load failed", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack ?? null : null,
        });
        knowledgeRegistry = createKnowledgeRegistryFromEntries([], defaultKnowledgeRegistryRoot());
      }
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
        reviewerDomainsLoaded: [analysisRequest.subjectModule.id],
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
        moduleId: legalDecision.moduleId,
        moduleTitle: legalDecision.moduleTitle,
        status: legalDecision.status,
        reason: legalDecision.reason,
        confidence: legalDecision.confidence,
        articleIds: [...legalDecision.articleIds],
        finding: legalDecision.finding as unknown as Record<string, unknown> | null,
        exceptions: [...legalDecision.exceptions] as readonly unknown[],
        trace: [...legalDecision.trace] as readonly unknown[],
        candidateCount: semanticCandidates.length,
        acceptedCount: legalDecision.finding ? 1 : 0,
        rejectedCount: legalDecision.status === "reject" ? 1 : 0,
        needsReviewCount: legalDecision.status === "needs_review" ? 1 : 0,
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
        inputDecision: legalDecision as unknown as Record<string, unknown>,
        outputFindings: findings as readonly unknown[],
        articleMapping: gcamMapping as unknown as Record<string, unknown>,
        confidence: gcamMapping.confidence,
        title: gcamMapping.findingTitle,
        description: gcamMapping.reviewerExplanation,
        evidenceSnippet: findings[0]?.evidence_snippet ?? legalDecision.finding?.evidence.text ?? null,
        articleIds: findings.map((findingItem) => findingItem.article_id),
        atomIds: findings.flatMap((findingItem) => (findingItem.atom_id ? [findingItem.atom_id] : [])),
        legalModule: legalDecision.moduleId,
        legalModuleTitle: legalDecision.moduleTitle,
        mappedCount: findings.length,
        droppedCount: Math.max(0, (legalDecision.finding ? 1 : 0) - findings.length),
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
    } catch (error) {
      logger.warn("V3 inspection capture failed", {
        jobId: input.jobId,
        chunkId: input.chunkId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      });
    }
  }

  return Object.freeze({
    analysisResponse,
    findings,
    diagnostics,
      truthLayerMeta: Object.freeze({
      ...truthLayerMeta,
      explanation,
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
