import { canonicalStringify } from "../canonicalJson.js";
import { sha256 } from "../hash.js";
import { createSceneAnalysisEngine, type SceneAnalysisEngine } from "../analysisEngineV4/sceneAnalysisEngine.js";
import type { SceneAnalysisState } from "../analysisEngineV4/sceneAnalysisState.js";
import type { AnalysisEngine, AnalysisJobContext, AnalysisDiagnostics, AnalysisResult } from "./types.js";
import { createLegalDecision, createLegalFinding } from "../analysisEngineV3/legal/legalResult.js";
import { mapLegalDecisionToFindings, evaluateRuntimeGcamMapping } from "../analysisEngineV3/runtime/findingMapper.js";
import type { IntelligenceContext } from "../analysisEngineV3/intelligence/intelligenceContext.js";
import { normalizeConceptContext } from "../analysisEngineV3/concepts/conceptNormalizer.js";
import type { Concept } from "../analysisEngineV3/concepts/conceptTypes.js";
import { createEmptyConceptContext } from "../analysisEngineV3/concepts/conceptNormalizer.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function hashValue(value: unknown): string {
  return sha256(canonicalStringify(value));
}

function toConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(6));
}

function toLegacyEvidenceType(sourceType: unknown): "unknown" | "dialogue" | "scene_description" | "story_context" | "mixed" {
  switch (sourceType) {
    case "Dialogue":
    case "dialogue":
      return "dialogue";
    case "Action":
    case "Description":
    case "action":
    case "description":
      return "scene_description";
    case "Narration":
    case "VoiceOver":
    case "Document":
    case "Sign":
    case "Screen":
    case "Media":
    case "Phone":
    case "Message":
    case "SocialPost":
    case "story_context":
    case "narration":
      return "story_context";
    case "mixed":
      return "mixed";
    default:
      return "unknown";
  }
}

function buildConceptContext(state: SceneAnalysisState): ReturnType<typeof normalizeConceptContext> {
  const concepts: Concept[] = state.detectedConcepts.map((concept, index) => freeze({
    id: concept.conceptId,
    label: concept.label,
    confidence: freeze({
      narrative: 0,
      semantic: toConfidence(concept.confidence),
      storyMemory: 0,
      entity: 0,
      glossary: 0,
      evidence: toConfidence(concept.confidence),
      total: toConfidence(concept.confidence),
    }),
    evidenceSources: freeze([
      freeze({
        sourceType: "evidence" as const,
        sourceText: concept.rationale[0] ?? concept.label,
        originatingSentence: state.primaryEvidenceText ?? state.normalizedSceneText ?? state.sceneText,
        entityId: null,
        glossaryTerm: null,
        confidence: toConfidence(concept.confidence),
      }),
    ]),
    originatingSentences: freeze([state.primaryEvidenceText ?? state.normalizedSceneText ?? `concept-${index + 1}`]),
    entityReferences: freeze([]),
    glossaryReferences: freeze([]),
  }));

  if (concepts.length === 0) {
    return createEmptyConceptContext();
  }

  return normalizeConceptContext(freeze({
    concepts: freeze(concepts),
    conceptIds: freeze(concepts.map((concept) => concept.id)),
    primaryConceptId: concepts[0]?.id ?? null,
    confidence: concepts[0]?.confidence.total ?? 0,
    conceptCount: concepts.length,
  }));
}

function buildAnalysisResponse(state: SceneAnalysisState, request: AnalysisJobContext["request"]): AnalysisResult {
  const selectedArticle = state.primaryArticle ?? state.legalPrimaryArticle ?? null;
  const primaryEvidence = state.evidenceSpans[0] ?? null;
  const conceptContext = buildConceptContext(state);
  const narrative = freeze({
    speaker: state.sceneModel?.characters[0] ?? null,
    listener: null,
    target: null,
    narrativeVoice: state.sceneModel?.dialogueLines.length ? "dialogue" : "narration",
    sceneType: state.sceneModel?.heading.sceneType ?? "unknown",
    narrativeIntent: state.qualityJudgment?.status === "reject" ? "condemnation" : "neutral",
    storyPosition: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    relationship: null,
    emotionalTone: "neutral",
    condemnation: state.qualityJudgment?.status === "reject" ? true : null,
    approval: state.qualityJudgment?.status === "pass" ? true : null,
    neutrality: state.qualityJudgment?.status === "pass" ? true : null,
    historicalContext: null,
    dream: null,
    flashback: null,
    comedy: null,
    satire: null,
    threat: null,
    instruction: null,
    news: null,
    documentary: null,
    dialogue: Boolean(state.sceneModel?.dialogueLines.length),
    narration: Boolean(state.sceneModel?.actionLines.length),
    sceneDescription: Boolean(state.sceneModel?.actionLines.length),
    confidence: 1,
    notes: freeze(["Synthesized from the V4 scene analysis state."]),
  });
  const evidence = freeze({
    candidates: freeze(state.evidenceSpans.map((span) => freeze({
      text: span.text,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
      confidence: span.confidence,
      source: "chunk" as const,
      notes: span.rationale,
    }))),
    primaryCandidateIndex: state.evidenceSpans.length > 0 ? 0 : null,
    admissible: state.evidenceSpans.length > 0,
    confidence: state.evidenceSpans.length > 0 ? 1 : 0,
    quote: primaryEvidence?.text ?? null,
    scene: state.sceneModel?.summary ?? state.normalizedSceneText ?? request.chunkText,
    page: primaryEvidence?.pageReferences[0]?.pageNumber ?? null,
    evidenceType: toLegacyEvidenceType(primaryEvidence?.sourceType),
    observedFacts: freeze(state.evidenceSpans.map((span) => span.text)),
    notes: freeze(["Derived from the V4 grounded evidence span(s)."]),
  });
  const semantic = freeze({
    semanticMeaning: state.detectedConcepts[0]?.label ?? state.sceneModel?.summary ?? request.chunkText,
    narrativeIntent: state.qualityJudgment?.status === "reject" ? "condemnation" : "neutral",
    conversationRole: state.sceneModel?.dialogueLines.length ? "dialogue" : "scene_description",
    sceneRole: state.sceneModel?.heading.sceneType ?? "unknown",
    speaker: state.sceneModel?.characters[0] ?? null,
    listener: null,
    target: null,
    victim: null,
    emotion: null,
    riskContext: state.knowledgeDomains[0] ?? null,
    confidence: state.detectedConcepts[0]?.confidence ?? 0,
    notes: freeze(["Derived from V4 concepts and knowledge domains."]),
  });
  const context = freeze({
    storyMemory: request.storyMemory,
    sceneMemory: request.sceneMemory,
    localContext: state.sceneModel?.summary ?? state.normalizedSceneText ?? request.chunkText,
    chunkContext: request.chunkText,
    neighboringSentences: freeze([...request.neighboringSentences]),
    narrativeContext: state.sceneModel?.summary ?? state.normalizedSceneText ?? request.chunkText,
    confidence: 1,
    notes: freeze(["Synthesized from the V4 scene analysis pipeline."]),
  });

  const legalDecision = createLegalDecision({
    moduleId: "v4_scene_analysis",
    moduleTitle: "V4 Scene Analysis",
    articleIds: selectedArticle ? [selectedArticle.articleId] : [],
    applies: Boolean(selectedArticle),
    status: state.qualityJudgment?.status === "pass" ? "accept" : "reject",
    reason: state.explanation?.summary ?? "V4 scene analysis result",
    confidence: toConfidence(selectedArticle?.score ?? 0.5),
    semantic,
    narrative,
    evidence,
    context,
    exceptions: [],
    finding: selectedArticle
      ? createLegalFinding({
          findingKey: `${request.jobId}:${request.chunkId}:v4`,
          moduleId: "v4_scene_analysis",
          moduleTitle: "V4 Scene Analysis",
          articleIds: [selectedArticle.articleId],
          status: state.qualityJudgment?.status === "pass" ? "accept" : "reject",
          reason: state.explanation?.summary ?? "V4 scene analysis result",
          confidence: toConfidence(selectedArticle.score / 200),
          semantic,
          narrative,
          evidence: evidence.candidates[evidence.primaryCandidateIndex ?? 0] ?? {
            text: request.chunkText,
            startOffset: request.chunkStart,
            endOffset: request.chunkEnd,
            confidence: 1,
            source: "chunk",
            notes: [],
          },
          context,
          exceptionCodes: [],
        })
      : null,
    trace: freeze([
      `sceneId=${state.sceneId}`,
      `selectedArticle=${selectedArticle?.articleId ?? "none"}`,
      `concepts=${state.detectedConcepts.map((concept) => concept.conceptId).join(",") || "none"}`,
    ]),
  });

  const gcamMapping = evaluateRuntimeGcamMapping(legalDecision, freeze({
    moduleId: request.scriptId,
    storyMemory: request.storyMemory,
    narrative,
    evidence,
    semantic,
    context,
    narrativeIntent: semantic.narrativeIntent,
    speaker: semantic.speaker,
    listener: semantic.listener,
    target: semantic.target,
    victim: semantic.victim,
    sceneType: narrative.sceneType,
    dialogueMode: narrative.dialogue ? "dialogue" : narrative.narration ? "narration" : "unknown",
    interpretationMode: state.qualityJudgment?.status === "reject" ? "condemnation" : "neutral",
    flags: freeze({
      dialogue: Boolean(narrative.dialogue),
      narration: Boolean(narrative.narration),
      promotion: false,
      condemnation: Boolean(narrative.condemnation),
      description: Boolean(narrative.sceneDescription),
      historical: Boolean(narrative.historicalContext),
      educational: false,
      satire: Boolean(narrative.satire),
      documentary: Boolean(narrative.documentary),
      fiction: true,
      threat: Boolean(narrative.threat),
      instruction: Boolean(narrative.instruction),
      news: Boolean(narrative.news),
      comedy: Boolean(narrative.comedy),
      dream: Boolean(narrative.dream),
      flashback: Boolean(narrative.flashback),
      quotation: false,
      approval: Boolean(narrative.approval),
      neutrality: Boolean(narrative.neutrality),
    }),
    entities: freeze((state.sceneModel?.characters ?? []).map((character, index) => freeze({
      id: `entity-${index + 1}`,
      label: character,
      role: "entity" as const,
      source: "narrative" as const,
      confidence: 0.5,
      evidence: null,
    }))),
    glossaryReferences: freeze([]),
    evidenceAssessment: freeze({
      primaryText: primaryEvidence?.text ?? request.chunkText,
      primaryStartOffset: primaryEvidence?.startOffset ?? request.chunkStart,
      primaryEndOffset: primaryEvidence?.endOffset ?? request.chunkEnd,
      primaryCandidateIndex: evidence.primaryCandidateIndex,
      candidateCount: evidence.candidates.length,
      admissible: evidence.admissible,
      confidence: evidence.confidence,
      source: "chunk" as const,
      notes: freeze(["Synthesized by the V4 adapter."]),
    }),
    contextConfidence: 1,
    legalConcepts: freeze([...conceptContext.conceptIds]),
    conceptContext,
    glossary: request as unknown as never,
  }) as unknown as IntelligenceContext);

  const intelligence = freeze({
    moduleId: "v4_scene_analysis",
    storyMemory: request.storyMemory,
    narrative,
    evidence,
    semantic,
    context,
    narrativeIntent: narrative.narrativeIntent,
    speaker: semantic.speaker,
    listener: semantic.listener,
    target: semantic.target,
    victim: semantic.victim,
    sceneType: narrative.sceneType,
    dialogueMode: narrative.dialogue ? "dialogue" : narrative.narration ? "narration" : "unknown",
    interpretationMode: state.qualityJudgment?.status === "reject" ? "condemnation" : "neutral",
    flags: freeze({
      dialogue: Boolean(narrative.dialogue),
      narration: Boolean(narrative.narration),
      promotion: false,
      condemnation: Boolean(narrative.condemnation),
      description: Boolean(narrative.sceneDescription),
      historical: Boolean(narrative.historicalContext),
      educational: false,
      satire: Boolean(narrative.satire),
      documentary: Boolean(narrative.documentary),
      fiction: true,
      threat: Boolean(narrative.threat),
      instruction: Boolean(narrative.instruction),
      news: Boolean(narrative.news),
      comedy: Boolean(narrative.comedy),
      dream: Boolean(narrative.dream),
      flashback: Boolean(narrative.flashback),
      quotation: false,
      approval: Boolean(narrative.approval),
      neutrality: Boolean(narrative.neutrality),
    }),
    entities: freeze((state.sceneModel?.characters ?? []).map((character, index) => freeze({
      id: `entity-${index + 1}`,
      label: character,
      role: "entity" as const,
      source: "narrative" as const,
      confidence: 0.5,
      evidence: null,
    }))),
    glossaryReferences: freeze([]),
    evidenceAssessment: freeze({
      primaryText: primaryEvidence?.text ?? request.chunkText,
      primaryStartOffset: primaryEvidence?.startOffset ?? request.chunkStart,
      primaryEndOffset: primaryEvidence?.endOffset ?? request.chunkEnd,
      primaryCandidateIndex: evidence.primaryCandidateIndex,
      candidateCount: evidence.candidates.length,
      admissible: evidence.admissible,
      confidence: evidence.confidence,
      source: "chunk" as const,
      notes: freeze(["Synthesized by the V4 adapter."]),
    }),
    contextConfidence: 1,
    legalConcepts: freeze([...conceptContext.conceptIds]),
    conceptContext,
    glossary: request as unknown as never,
  }) as unknown as IntelligenceContext;

  const diagnostics: AnalysisDiagnostics = freeze({
    engineVersion: "v4",
    providerName: "v4_scene_engine",
    modelName: "v4_scene_engine",
    modelVersion: "v4",
    rawResponseHash: hashValue(state),
    responseId: `v4:${request.jobId}:${request.chunkId}`,
    responseTimestamp: null,
    promptHash: hashValue({ jobId: request.jobId, chunkId: request.chunkId, engine: "v4" }),
    semanticHash: hashValue(state.detectedConcepts),
    legalHash: hashValue(state.primaryArticle ?? state.legalPrimaryArticle ?? null),
    executionSignatureHash: hashValue({ jobId: request.jobId, chunkId: request.chunkId, engine: "v4" }),
    stageHashes: freeze([
      freeze({ stage: "narrative", hash: hashValue(state.sceneModel?.summary ?? request.chunkText) }),
      freeze({ stage: "evidence", hash: hashValue(state.evidenceSpans) }),
      freeze({ stage: "semantic", hash: hashValue(state.detectedConcepts) }),
      freeze({ stage: "context", hash: hashValue(state.knowledgeDomains) }),
      freeze({ stage: "intelligence", hash: hashValue(state.candidateArticles) }),
      freeze({ stage: "legal", hash: hashValue(state.explanation?.summary ?? state.qualityJudgment) }),
    ]),
    stageTimings: freeze([
      freeze({ stage: "narrative", durationMs: null }),
      freeze({ stage: "evidence", durationMs: null }),
      freeze({ stage: "semantic", durationMs: null }),
      freeze({ stage: "context", durationMs: null }),
      freeze({ stage: "intelligence", durationMs: null }),
      freeze({ stage: "legal", durationMs: null }),
    ]),
    subjectModuleId: "v4_scene_analysis",
    chunkHash: hashValue(request.chunkText),
    findingCount: selectedArticle ? 1 : 0,
  });

  const findings = mapLegalDecisionToFindings({
    decision: legalDecision,
    chunkStart: request.chunkStart,
    chunkEnd: request.chunkEnd,
    startLine: request.startLine ?? null,
    endLine: request.endLine ?? null,
    diagnostics: diagnostics as unknown as Parameters<typeof mapLegalDecisionToFindings>[0]["diagnostics"],
    gcamMapping,
  });

  const analysisResponse = freeze({
    promptHash: diagnostics.promptHash,
    semanticHash: diagnostics.semanticHash,
    legalHash: diagnostics.legalHash,
    stageHashes: diagnostics.stageHashes,
    stageTimings: diagnostics.stageTimings,
    narrative,
    evidence,
    semantic,
    context,
    intelligence,
    legalDecision,
    diagnostics,
  });

  const truthLayerMeta = freeze({
    architecture: "analysis_engine_v4_adapter",
    engine_version: diagnostics.engineVersion,
    provider_name: diagnostics.providerName,
    model_name: diagnostics.modelName,
    model_version: diagnostics.modelVersion,
    prompt_hash: diagnostics.promptHash,
    semantic_hash: diagnostics.semanticHash,
    legal_hash: diagnostics.legalHash,
    raw_response_hash: diagnostics.rawResponseHash,
    execution_signature_hash: diagnostics.executionSignatureHash,
    stage_hashes: diagnostics.stageHashes,
    stage_timings: diagnostics.stageTimings,
    subject_module_id: diagnostics.subjectModuleId,
    chunk_hash: diagnostics.chunkHash,
    finding_count: diagnostics.findingCount,
    findings_count: findings.length,
    gcam_mapping: gcamMapping,
  });

  return {
    analysisResponse: analysisResponse as unknown as AnalysisResult["analysisResponse"],
    findings,
    diagnostics,
    truthLayerMeta,
  };
}

export function createAnalysisEngineV4Adapter(dependencies: Readonly<{
  sceneAnalysisEngine?: SceneAnalysisEngine;
}> = {}): AnalysisEngine {
  const sceneAnalysisEngine = dependencies.sceneAnalysisEngine ?? createSceneAnalysisEngine();

  return freeze({
    async execute(jobContext: AnalysisJobContext): Promise<AnalysisResult> {
      const state = await sceneAnalysisEngine.run(jobContext.request.chunkId, jobContext.request.chunkText);
      return buildAnalysisResponse(state, jobContext.request) as unknown as AnalysisResult;
    },
  });
}
