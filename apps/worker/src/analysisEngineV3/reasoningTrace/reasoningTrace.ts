import { canonicalStringify } from "../../canonicalJson.js";
import { sha256 } from "../../hash.js";
import type { V3RuntimeFinding } from "../runtime/runtimeTypes.js";
import type {
  V3ReasoningTraceCandidate,
  V3ReasoningTraceFinding,
  V3ReasoningTraceInput,
  V3ReasoningTraceProviderResponse,
  V3ReasoningTraceStage,
  V3ReasoningTraceTimelineEntry,
  V3ReasoningTraceValidationDecision,
  V3ReasoningTraceValidatorDecisions,
} from "./reasoningTypes.js";

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim() : "";
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)),
  );
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeConfidence(value: unknown, fallback = 0): number {
  return Number(safeNumber(value, fallback).toFixed(6));
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeStringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? uniqueStrings(value.filter((entry): entry is string => typeof entry === "string")) : Object.freeze([]);
}

function scoreWhy(reasons: readonly string[]): string {
  return reasons.length > 0 ? reasons.join(" | ") : "No explicit reason supplied.";
}

function normalizeCandidate(candidate: {
  id: string;
  label: string;
  score: number;
  confidence: number;
  reasons: readonly string[];
  selected: boolean;
}): V3ReasoningTraceCandidate {
  return Object.freeze({
    id: normalizeText(candidate.id),
    label: normalizeText(candidate.label),
    score: safeConfidence(candidate.score),
    confidence: safeConfidence(candidate.confidence),
    why: scoreWhy(candidate.reasons),
    reasons: uniqueStrings(candidate.reasons),
    selected: Boolean(candidate.selected),
  });
}

function buildEvidenceEntries(input: V3ReasoningTraceInput, finding: V3RuntimeFinding): readonly Readonly<{
  text: string;
  quote: string;
  startOffset: number;
  endOffset: number;
  confidence: number;
  source: string;
  concepts: readonly string[];
  entities: readonly string[];
  reason: string;
}>[] {
  const candidates = input.analysisResponse.evidence.candidates;
  const sourceEvidence = candidates.map((candidate) => Object.freeze({
    text: normalizeText(candidate.text),
    quote: normalizeText(candidate.text),
    startOffset: safeNumber(candidate.startOffset, 0),
    endOffset: safeNumber(candidate.endOffset, 0),
    confidence: safeConfidence(candidate.confidence),
    source: safeString(candidate.source) || "chunk",
    concepts: Object.freeze([...safeStringList((candidate as Record<string, unknown>).concepts)]),
    entities: Object.freeze([...safeStringList((candidate as Record<string, unknown>).entities)]),
    reason: normalizeText((candidate as Record<string, unknown>).reason as string | undefined) || "Exact screenplay evidence.",
  }));

  if (sourceEvidence.length > 0) {
    return Object.freeze(sourceEvidence);
  }

  const fallbackQuote = normalizeText(finding.evidence_snippet ?? input.analysisResponse.legalDecision.evidence.candidates[0]?.text ?? input.analysisResponse.context.localContext);
  return Object.freeze([
    Object.freeze({
      text: fallbackQuote,
      quote: fallbackQuote,
      startOffset: safeNumber(finding.start_offset_global ?? input.analysisResponse.legalDecision.evidence.candidates[0]?.startOffset, 0),
      endOffset: safeNumber(finding.end_offset_global ?? input.analysisResponse.legalDecision.evidence.candidates[0]?.endOffset, 0),
      confidence: safeConfidence(finding.confidence),
      source: "synthesized",
      concepts: Object.freeze([]),
      entities: Object.freeze([]),
      reason: "Synthesized from the final finding because no evidence candidates were available in the trace input.",
    }),
  ]);
}

function buildSceneSummary(input: V3ReasoningTraceInput): Readonly<Record<string, unknown>> {
  return Object.freeze({
    narrative: input.analysisResponse.narrative,
    context: input.analysisResponse.context,
    semantic: input.analysisResponse.semantic,
    intelligence: {
      narrativeIntent: input.analysisResponse.intelligence.narrativeIntent,
      dialogueMode: input.analysisResponse.intelligence.dialogueMode,
      interpretationMode: input.analysisResponse.intelligence.interpretationMode,
      speaker: input.analysisResponse.intelligence.speaker,
      listener: input.analysisResponse.intelligence.listener,
      target: input.analysisResponse.intelligence.target,
      victim: input.analysisResponse.intelligence.victim,
      sceneType: input.analysisResponse.intelligence.sceneType,
      flags: input.analysisResponse.intelligence.flags,
      evidenceAssessment: input.analysisResponse.intelligence.evidenceAssessment,
      conceptContext: {
        primaryConceptId: input.analysisResponse.intelligence.conceptContext.primaryConceptId,
        conceptCount: input.analysisResponse.intelligence.conceptContext.conceptCount,
        confidence: input.analysisResponse.intelligence.conceptContext.confidence,
        conceptIds: [...input.analysisResponse.intelligence.conceptContext.conceptIds],
      },
    },
  });
}

function buildReviewerCandidates(input: V3ReasoningTraceInput): readonly V3ReasoningTraceCandidate[] {
  const routing = input.reviewerKnowledgeSelection.routing;
  return Object.freeze(
    routing.reviewerScores.map((score) => normalizeCandidate({
      id: score.reviewerId,
      label: score.label,
      score: score.score,
      confidence: score.confidence,
      reasons: score.reasons,
      selected: routing.selectedReviewerIds.includes(score.reviewerId),
    })),
  );
}

function buildArticleCandidates(input: V3ReasoningTraceInput): readonly V3ReasoningTraceCandidate[] {
  const diagnostics = input.candidateDiagnostics;
  if (diagnostics?.articleRanking.articleScores.length) {
    return Object.freeze(
      diagnostics.articleRanking.articleScores.map((score) => normalizeCandidate({
        id: score.articleId,
        label: score.policyTitle ?? score.articleId,
        score: score.score,
        confidence: score.confidence,
        reasons: score.reasons.length > 0
          ? score.reasons
          : score.matchedTerms.length > 0
            ? score.matchedTerms.map((term) => `matched:${term}`)
            : [`reviewer:${score.reviewer}`],
        selected: score.selected,
      })),
    );
  }

  return Object.freeze(
    input.reviewerDecision.reasoning.articleEvaluations.map((evaluation) => normalizeCandidate({
      id: String(evaluation.articleId),
      label: `article:${evaluation.articleId}`,
      score: evaluation.confidence,
      confidence: evaluation.confidence,
      reasons: [evaluation.reason, ...evaluation.evidence],
      selected: evaluation.status === "PASS",
    })),
  );
}

function buildAtomCandidates(input: V3ReasoningTraceInput): readonly V3ReasoningTraceCandidate[] {
  const diagnostics = input.candidateDiagnostics;
  if (diagnostics?.atomRanking.atomScores.length) {
    return Object.freeze(
      diagnostics.atomRanking.atomScores.map((score) => normalizeCandidate({
        id: score.atomId,
        label: score.policyAtomTitle ?? score.atomId,
        score: score.score,
        confidence: score.confidence,
        reasons: score.reasons.length > 0
          ? score.reasons
          : score.matchedTerms.length > 0
            ? score.matchedTerms.map((term) => `matched:${term}`)
            : [`reviewer:${score.reviewer}`],
        selected: score.selected,
    })),
    );
  }

  const findingAtom = input.findings[0]?.atom_id ?? input.gcamMapping.atomId ?? null;
  return Object.freeze(
    findingAtom
      ? [normalizeCandidate({
          id: String(findingAtom),
          label: String(findingAtom),
          score: input.validatedLegalDecision.confidence,
          confidence: input.validatedLegalDecision.confidence,
          reasons: [input.validatedLegalDecision.reason],
          selected: true,
        })]
      : [],
  );
}

function buildPromptSummary(input: V3ReasoningTraceInput): Readonly<{
  promptHash: string;
  userPromptHash: string;
  promptLengthChars: number;
  userPromptLengthChars: number;
  estimatedPromptTokens: number;
  promptPreview: string;
  promptSummary: string;
}> {
  const promptLengthChars = input.renderedPrompt.prompt.length;
  const userPromptLengthChars = input.userPrompt.length;
  const estimatedPromptTokens = Math.max(1, Math.ceil((promptLengthChars + userPromptLengthChars) / 4));
  const promptPreview = input.reviewerCompiledContext?.promptPreview ?? input.renderedPrompt.prompt.slice(0, 1200);
  const promptSummary = [
    `Prompt chars: ${promptLengthChars}`,
    `User prompt chars: ${userPromptLengthChars}`,
    `Estimated tokens: ${estimatedPromptTokens}`,
    `Reviewer packs: ${input.reviewerKnowledgeRetrieval.selectedPacks.length}`,
    `Candidate articles: ${input.candidateDiagnostics?.articleRanking.selectedArticleCount ?? input.validatedLegalDecision.articleIds.length}`,
    `Candidate atoms: ${input.candidateDiagnostics?.atomRanking.selectedAtomCount ?? (input.validatedLegalDecision.finding ? 1 : 0)}`,
  ].join(" | ");

  return Object.freeze({
    promptHash: input.renderedPrompt.promptHash,
    userPromptHash: sha256(input.userPrompt),
    promptLengthChars,
    userPromptLengthChars,
    estimatedPromptTokens,
    promptPreview,
    promptSummary,
  });
}

function buildProviderResponseSummary(input: V3ReasoningTraceInput): V3ReasoningTraceProviderResponse {
  return Object.freeze({
    providerName: input.rawResponse.providerName,
    modelName: input.rawResponse.modelName,
    modelVersion: input.rawResponse.modelVersion,
    responseId: input.rawResponse.responseId,
    responseTimestamp: input.rawResponse.responseTimestamp,
    finishReason: input.rawResponse.finishReason,
    usage: input.rawResponse.usage,
    rawResponseHash: sha256(input.rawResponse.rawResponse),
    rawResponseChars: input.rawResponse.rawResponse.length,
    parsedStatus: input.validatedLegalDecision.status,
    parsedConfidence: safeConfidence(input.validatedLegalDecision.confidence),
    parsedReasoning: input.validatedLegalDecision.reason,
    parsedArticles: [...input.validatedLegalDecision.articleIds],
  });
}

function buildValidatorDecisions(input: V3ReasoningTraceInput): V3ReasoningTraceValidatorDecisions {
  const grounding: V3ReasoningTraceValidationDecision = Object.freeze({
    name: "reasonedDecisionValidation",
    valid: input.groundingValidation.valid,
    reason: input.groundingValidation.validationNote,
    issues: Object.freeze(input.groundingValidation.issues.map((issue: { code: string; path: string; message: string }) => Object.freeze({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    }))),
    lineOfCode: "provider/reasonedDecisionValidation.ts",
  });

  const scope: V3ReasoningTraceValidatorDecisions["scope"] = Object.freeze({
    valid: input.scopeValidation.acceptedFindingsCount > 0,
    reason: input.scopeValidation.scopeReason,
    selectedReviewers: [...input.scopeValidation.selectedReviewerLabels],
    rejectedReviewers: [...input.scopeValidation.rejectedReviewerLabels],
    acceptedFindingsCount: input.scopeValidation.acceptedFindingsCount,
    rejectedFindingsByScopeCount: input.scopeValidation.rejectedFindingsByScopeCount,
    lineOfCode: "runtime/reviewerScopeValidator.ts",
  });

  const mappingDecision = Object.freeze({
    decisionStatus: input.validatedLegalDecision.status,
    decisionArticle: input.validatedLegalDecision.finding?.articleIds[0] ?? input.validatedLegalDecision.articleIds[0] ?? null,
    decisionAtom: input.gcamMapping.atomId,
    decisionReason: input.validatedLegalDecision.reason,
    validatorHistory: [...input.validatedLegalDecision.trace],
    acceptedCount: input.findings.length,
    rejectedCount: input.validatedLegalDecision.status === "reject" ? 1 : 0,
    droppedCount: Math.max(0, (input.validatedLegalDecision.finding ? 1 : 0) - input.findings.length),
    lineOfCode: "runtime/findingMapper.ts",
  });

  return Object.freeze({
    grounding,
    scope,
    mapping: mappingDecision,
    rejectionReasons: uniqueStrings([
      ...grounding.issues.map((issue) => `${issue.code}:${issue.path}`),
      ...(scope.valid ? [] : [scope.reason]),
      ...(mappingDecision.droppedCount > 0 ? ["mapping:decision_dropped"] : []),
    ]),
  });
}

function buildStages(input: V3ReasoningTraceInput, finding: V3RuntimeFinding): readonly V3ReasoningTraceStage[] {
  const promptSummary = buildPromptSummary(input);
  const providerResponse = buildProviderResponseSummary(input);
  const reviewerCandidates = buildReviewerCandidates(input);
  const articleCandidates = buildArticleCandidates(input);
  const atomCandidates = buildAtomCandidates(input);
  const validatorDecisions = buildValidatorDecisions(input);
  const scene = buildSceneSummary(input);
  const extractedEvidence = buildEvidenceEntries(input, finding);
  const keywords = uniqueStrings([
    ...input.reviewerKnowledgeRetrieval.queryTerms.slice(0, 64),
    ...input.analysisResponse.semantic.semanticMeaning.split(/\s+/u),
    ...(input.analysisResponse.semantic.riskContext?.split(/\s+/u) ?? []),
  ]);

  return Object.freeze([
    Object.freeze({
      stage: "scene",
      order: 1,
      title: "Scene",
      why: "Capture the screenplay scene and semantic context that drove the evaluation.",
      inputCount: null,
      outputCount: null,
      payload: scene,
    }),
    Object.freeze({
      stage: "extracted_evidence",
      order: 2,
      title: "Extracted Evidence",
      why: "Preserve the exact quote-based evidence used by the legal engine.",
      inputCount: input.analysisResponse.evidence.candidates.length,
      outputCount: extractedEvidence.length,
      payload: {
        evidence_candidates: extractedEvidence,
        evidence_confidence: input.analysisResponse.evidence.confidence,
        admissible: input.analysisResponse.evidence.admissible,
      },
    }),
    Object.freeze({
      stage: "detected_keywords",
      order: 3,
      title: "Detected Keywords",
      why: "Capture the query and semantic terms that influenced retrieval.",
      inputCount: keywords.length,
      outputCount: keywords.length,
      payload: {
        keywords,
        query_terms: [...input.reviewerKnowledgeRetrieval.queryTerms],
        reasoning_trace: [...(input.analysisResponse.semantic.notes ?? [])],
      },
    }),
    Object.freeze({
      stage: "detected_semantic_tags",
      order: 4,
      title: "Detected Semantic Tags",
      why: "Preserve the concept tags produced by the semantic layer.",
      inputCount: input.analysisResponse.intelligence.conceptContext.conceptIds.length,
      outputCount: input.analysisResponse.intelligence.conceptContext.conceptIds.length,
      payload: {
        concept_ids: [...input.analysisResponse.intelligence.conceptContext.conceptIds],
        primary_concept_id: input.analysisResponse.intelligence.conceptContext.primaryConceptId,
        concept_count: input.analysisResponse.intelligence.conceptContext.conceptCount,
        concept_confidence: input.analysisResponse.intelligence.conceptContext.confidence,
      },
    }),
    Object.freeze({
      stage: "detected_entities",
      order: 5,
      title: "Detected Entities",
      why: "Capture the named entities and their evidence-grounded roles.",
      inputCount: input.analysisResponse.intelligence.entities.length,
      outputCount: input.analysisResponse.intelligence.entities.length,
      payload: {
        entities: [...input.analysisResponse.intelligence.entities],
      },
    }),
    Object.freeze({
      stage: "reviewer_candidates",
      order: 6,
      title: "Reviewer Candidates",
      why: "Record the deterministic reviewer routing decision before prompt generation.",
      inputCount: reviewerCandidates.length,
      outputCount: input.reviewerKnowledgeSelection.routing.selectedReviewerIds.length,
      payload: {
        selected_reviewers: [...input.reviewerKnowledgeSelection.routing.selectedReviewerLabels],
        selected_reviewer_ids: [...input.reviewerKnowledgeSelection.routing.selectedReviewerIds],
        rejected_reviewers: [...input.reviewerKnowledgeSelection.routing.rejectedReviewerLabels],
        rejected_reviewer_ids: [...input.reviewerKnowledgeSelection.routing.rejectedReviewerIds],
        reviewer_scores: reviewerCandidates,
        routing_confidence: input.reviewerKnowledgeSelection.routing.routingConfidence,
        routing_reason: input.reviewerKnowledgeSelection.routing.routingReason,
        knowledge_reduction_percent: input.reviewerKnowledgeSelection.routing.knowledgeReductionPercent,
      },
    }),
    Object.freeze({
      stage: "reviewer_selection",
      order: 7,
      title: "Reviewer Selection",
      why: "Document which reviewer pack was selected and why others were rejected.",
      inputCount: input.reviewerKnowledgeSelection.routing.reviewerScores.length,
      outputCount: input.reviewerKnowledgeSelection.routing.selectedReviewerPackIds.length,
      payload: {
        reviewer_pack_ids: [...input.reviewerKnowledgeSelection.routing.selectedReviewerPackIds],
        reviewer_folders: [...input.reviewerKnowledgeSelection.routing.selectedAcademyFolders],
        reviewer_knowledge_count: input.reviewerKnowledgeRetrieval.selectedPacks.length,
        reviewer_compiled_context: input.reviewerCompiledContext ?? null,
      },
    }),
    Object.freeze({
      stage: "article_candidates",
      order: 8,
      title: "Article Candidates",
      why: "Record the article ranking output before the legal engine chooses anything.",
      inputCount: articleCandidates.length,
      outputCount: articleCandidates.filter((candidate) => candidate.selected).length,
      payload: {
        article_scores: articleCandidates,
        candidate_diagnostics: input.candidateDiagnostics ? {
          enabled: input.candidateDiagnostics.enabled,
          article_reduction_percent: input.candidateDiagnostics.articleReductionPercent,
          atom_reduction_percent: input.candidateDiagnostics.atomReductionPercent,
          prompt_reduction_percent: input.candidateDiagnostics.promptReductionPercent,
          final_accepted_candidate: input.candidateDiagnostics.finalAcceptedCandidate,
        } : null,
      },
    }),
    Object.freeze({
      stage: "article_selection",
      order: 9,
      title: "Article Selection",
      why: "Capture the final article set used by the legal engine.",
      inputCount: articleCandidates.length,
      outputCount: input.validatedLegalDecision.articleIds.length,
      payload: {
        selected_articles: [...input.validatedLegalDecision.articleIds],
        reasoned_applicable_articles: [...input.validatedLegalDecision.articleIds],
        reasoned_rejected_articles: [...input.validatedLegalDecision.exceptions.map((exception) => exception.code)],
        article_selection_reason: input.validatedLegalDecision.reason,
      },
    }),
    Object.freeze({
      stage: "atom_candidates",
      order: 10,
      title: "Atom Candidates",
      why: "Record the atom ranking output before the legal engine chooses anything.",
      inputCount: atomCandidates.length,
      outputCount: atomCandidates.filter((candidate) => candidate.selected).length,
      payload: {
        atom_scores: atomCandidates,
      },
    }),
    Object.freeze({
      stage: "atom_selection",
      order: 11,
      title: "Atom Selection",
      why: "Capture the final atom used by the legal engine.",
      inputCount: atomCandidates.length,
      outputCount: finding.atom_id ? 1 : 0,
      payload: {
        selected_atom_id: finding.atom_id,
        selected_atom_article_id: finding.article_id,
        atom_selection_reason: input.gcamMapping.reviewerExplanation,
      },
    }),
    Object.freeze({
      stage: "prompt_summary",
      order: 12,
      title: "Prompt Summary",
      why: "Keep the exact prompt footprint visible for replay and profiling.",
      inputCount: promptSummary.promptLengthChars,
      outputCount: promptSummary.estimatedPromptTokens,
      payload: promptSummary,
    }),
    Object.freeze({
      stage: "provider_response",
      order: 13,
      title: "Provider Response",
      why: "Store the raw provider boundary and the parsed assistant response.",
      inputCount: input.rawResponse.rawResponse.length,
      outputCount: input.validatedLegalDecision.articleIds.length,
      payload: providerResponse,
    }),
    Object.freeze({
      stage: "validator_decisions",
      order: 14,
      title: "Validator Decisions",
      why: "Record every validation gate that shaped the final decision.",
      inputCount: input.groundingValidation.issues.length + input.scopeValidation.rejectedFindingsByScopeCount + input.validatedLegalDecision.trace.length,
      outputCount: input.findings.length,
      payload: validatorDecisions,
    }),
    Object.freeze({
      stage: "final_finding",
      order: 15,
      title: "Final Finding",
      why: "Store the final mapped finding or the absence of one.",
      inputCount: input.findings.length,
      outputCount: input.findings.length,
      payload: {
        finding: finding,
        final_findings: [...input.findings],
        final_legal_decision: input.validatedLegalDecision,
        gcam_mapping: input.gcamMapping,
        explanation: input.explanation,
        arbitration: input.arbitration,
        debate: input.reviewerDebate,
      },
    }),
  ]);
}

function buildTimeline(stages: readonly V3ReasoningTraceStage[], providerResponse: V3ReasoningTraceProviderResponse, arbitrationDecisionMs: number): readonly V3ReasoningTraceTimelineEntry[] {
  return Object.freeze(
    stages.map((stage) => {
      const durationMs = stage.stage === "provider_response"
        ? providerResponse.usage?.totalTokens ?? null
        : stage.stage === "final_finding"
          ? arbitrationDecisionMs
          : null;
      return Object.freeze({
        stage: stage.stage,
        order: stage.order,
        durationMs: typeof durationMs === "number" ? durationMs : null,
        note: stage.why,
      });
    }),
  );
}

function buildSyntheticTraceKey(input: V3ReasoningTraceInput, finding: V3RuntimeFinding, stages: readonly V3ReasoningTraceStage[]): string {
  return sha256(canonicalStringify({
    jobId: input.jobId,
    chunkId: input.chunkId,
    findingKey: input.findingKey,
    findingId: finding.canonical_finding_id ?? `${finding.article_id}:${input.validatedLegalDecision.articleIds[0] ?? "none"}`,
    stages,
    promptHash: input.renderedPrompt.promptHash,
    providerHash: sha256(input.rawResponse.rawResponse),
    legalStatus: input.validatedLegalDecision.status,
    articleIds: input.validatedLegalDecision.articleIds,
    atomId: finding.atom_id,
  }));
}

function buildTraceFinding(input: V3ReasoningTraceInput, finding: V3RuntimeFinding, findingIndex: number): V3ReasoningTraceFinding {
  const stages = buildStages(input, finding);
  const providerResponse = buildProviderResponseSummary(input);
  const promptSummary = buildPromptSummary(input);
  const validatorDecisions = buildValidatorDecisions(input);
  const decisionTimeline = buildTimeline(stages, providerResponse, input.arbitration.decisionDurationMs);
  const promptLengthChars = promptSummary.promptLengthChars + promptSummary.userPromptLengthChars;
  const promptTokens = promptSummary.estimatedPromptTokens;
  const payloadSizeChars = JSON.stringify({
    scene: stages[0]?.payload ?? {},
    evidence: stages[1]?.payload ?? {},
    provider: providerResponse,
    validators: validatorDecisions,
    finding,
  }).length;

  return Object.freeze({
    findingIndex,
    findingKey: input.findingKey,
    findingId: finding.canonical_finding_id ?? `${finding.article_id}:${finding.atom_id ?? "none"}`,
    articleId: finding.article_id,
    atomId: finding.atom_id ?? null,
    category: finding.category ?? "unknown",
    scene: stages[0]?.payload ?? {},
    extractedEvidence: buildEvidenceEntries(input, finding),
    detectedKeywords: uniqueStrings([
      ...input.reviewerKnowledgeRetrieval.queryTerms,
      ...input.analysisResponse.semantic.semanticMeaning.split(/\s+/u),
      ...(input.analysisResponse.semantic.riskContext?.split(/\s+/u) ?? []),
    ]),
    detectedSemanticTags: Object.freeze([...input.analysisResponse.intelligence.conceptContext.conceptIds]),
    detectedEntities: Object.freeze(input.analysisResponse.intelligence.entities.map((entity) => Object.freeze({
      id: entity.id,
      label: entity.label,
      role: entity.role,
      source: entity.source,
      confidence: entity.confidence,
      evidence: entity.evidence,
    }))),
    reviewerCandidates: buildReviewerCandidates(input),
    reviewerSelectionReason: input.reviewerKnowledgeSelection.routing.routingReason,
    articleCandidates: buildArticleCandidates(input),
    articleSelectionReason: input.validatedLegalDecision.reason,
    atomCandidates: buildAtomCandidates(input),
    atomSelectionReason: input.gcamMapping.reviewerExplanation,
    promptSummary,
    providerResponse,
    validatorDecisions,
    finalFinding: Object.freeze({
      ...finding,
    }) as Readonly<Record<string, unknown>>,
    stages,
    decisionTimeline,
    promptLengthChars,
    promptTokens,
    payloadSizeChars,
    traceHash: buildSyntheticTraceKey(input, finding, stages),
  });
}

function buildFallbackFinding(input: V3ReasoningTraceInput): V3RuntimeFinding | null {
  const primaryEvidence = input.validatedLegalDecision.evidence.candidates[input.validatedLegalDecision.evidence.primaryCandidateIndex ?? 0]
    ?? input.validatedLegalDecision.evidence.candidates[0]
    ?? null;
  if (!primaryEvidence && input.validatedLegalDecision.articleIds.length === 0) {
    return null;
  }

  return {
    source: "ai",
    article_id: input.validatedLegalDecision.articleIds[0] ?? input.gcamMapping.articleId ?? 0,
    atom_id: input.gcamMapping.atomId ?? null,
    severity: input.validatedLegalDecision.status === "reject" ? "low" : "medium",
    confidence: input.validatedLegalDecision.confidence,
    title_ar: input.gcamMapping.findingTitle,
    description_ar: input.gcamMapping.reviewerExplanation,
    evidence_snippet: primaryEvidence?.text ?? "",
    rationale_ar: input.validatedLegalDecision.reason,
    final_ruling: input.validatedLegalDecision.status,
    detection_pass: `lrt_${input.validatedLegalDecision.moduleId}`,
    location: {
      start_offset: primaryEvidence?.startOffset ?? 0,
      end_offset: primaryEvidence?.endOffset ?? 0,
      start_line: null,
      end_line: null,
      v3: {},
    },
    start_offset_global: primaryEvidence?.startOffset ?? 0,
    end_offset_global: primaryEvidence?.endOffset ?? 0,
    canonical_atom: null,
    lineage_id: null,
    parent_lineage_id: null,
    evidence_hash: null,
    canonical_hash: null,
    is_interpretive: input.validatedLegalDecision.status === "needs_review",
    depiction_type: "unknown",
    speaker_role: "unknown",
    narrative_consequence: "unknown",
    context_window_id: null,
    context_confidence: input.analysisResponse.context.confidence,
    lexical_confidence: input.analysisResponse.evidence.confidence,
    policy_confidence: input.analysisResponse.semantic.confidence,
    category: input.validatedLegalDecision.moduleId,
    finding_key: input.findingKey,
    canonical_finding_id: input.findingKey,
  } as V3RuntimeFinding;
}

export function buildV3LegalReasoningTrace(input: V3ReasoningTraceInput): readonly V3ReasoningTraceFinding[] {
  const fallbackFinding = buildFallbackFinding(input);
  const sourceFindings = input.findings.length > 0 ? input.findings : fallbackFinding ? [fallbackFinding] : [];
  return Object.freeze(sourceFindings.map((finding, index) => buildTraceFinding(input, {
    ...finding,
    findingIndex: index,
  } as V3RuntimeFinding, index)));
}
