import type {
  Evidence,
  EvidenceCollection,
  EvidencePageReference,
} from "./evidence/evidenceTypes.js";
import type { ConceptCollection } from "./concepts/conceptTypes.js";
import type { LegalDecisionCollection } from "./legal/legalDecision.js";
import type { QualityJudgeStatus, VerifiedFindingCollection } from "./judge/qualityJudgeTypes.js";

export type SceneAnalysisStatus = "pending" | "running" | "complete" | "failed";

export type SceneModelLine = Readonly<{
  lineId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  lineType: "dialogue" | "action" | "heading" | "transition" | "story_context";
}>;

export type SceneModelHeading = Readonly<{
  raw: string | null;
  sceneType: "interior" | "exterior" | "mixed" | "unknown";
  location: string | null;
  timeOfDay: string | null;
}>;

export type SceneModel = Readonly<{
  sceneId: string;
  rawSceneText: string;
  normalizedSceneText: string;
  heading: SceneModelHeading;
  lines: readonly SceneModelLine[];
  sentences: readonly SceneAnalysisSentence[];
  dialogueLines: readonly SceneModelLine[];
  actionLines: readonly SceneModelLine[];
  characters: readonly string[];
  summary: string;
}>;

export type SceneAnalysisSentence = Readonly<{
  sentenceId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  sourceType: "dialogue" | "scene_description" | "story_context";
}>;

export type SceneEvidencePageReference = EvidencePageReference;

export type SceneAnalysisEvidenceSpan = Evidence;

export type SceneAnalysisEvidenceCollection = EvidenceCollection;

export type SceneAnalysisConcept = Readonly<{
  conceptId: string;
  label: string;
  knowledgeDomains: readonly string[];
  evidenceSpanIds: readonly string[];
  confidence: number;
  rationale: readonly string[];
}>;

export type SceneAnalysisConceptCollection = ConceptCollection;

export type SceneAnalysisLegalDecisionCollection = LegalDecisionCollection;

export type SceneAnalysisArticleCandidate = Readonly<{
  articleId: number;
  titleAr: string;
  matchedKnowledgeDomains: readonly string[];
  matchedConceptIds: readonly string[];
  evidenceSpanIds: readonly string[];
  score: number;
  rationale: readonly string[];
}>;

export type SceneAnalysisAtomCandidate = Readonly<{
  articleId: number;
  articleTitleAr: string;
  atomId: string;
  atomTitleAr: string;
  canonicalAtomCode: string;
  evidenceSpanIds: readonly string[];
  score: number;
  rationale: readonly string[];
}>;

export type SceneAnalysisExplanation = Readonly<{
  summary: string;
  groundedEvidence: string;
  primaryArticleId: number | null;
  primaryArticleTitleAr: string | null;
  primaryAtomId: string | null;
  primaryAtomTitleAr: string | null;
  rationale: readonly string[];
}>;

export type SceneAnalysisExplanationRecommendedAction =
  | "Delete"
  | "Modify"
  | "Requires Approval"
  | "Refer to Authority"
  | "Requires Verification"
  | "No Action";

export type SceneAnalysisExplanationRecord = Readonly<{
  id: string;
  legalDecisionId: string;
  conceptId: string;
  evidenceId: string;
  title: string;
  summary: string;
  reasoning: readonly string[];
  recommendedAction: SceneAnalysisExplanationRecommendedAction;
  confidence: number;
}>;

export type SceneAnalysisExplanationValidationResult = Readonly<{
  status: "pass" | "reject";
  rejectedReasons: readonly string[];
}>;

export type SceneAnalysisExplanationCollection = Readonly<{
  sceneId: string;
  explanations: readonly SceneAnalysisExplanationRecord[];
  primaryExplanationId: string | null;
  primaryExplanation: SceneAnalysisExplanationRecord | null;
  prompt: string;
  response: string;
  validationResult: SceneAnalysisExplanationValidationResult;
  confidence: number;
  executionTimeMs: number;
}>;

export type SceneAnalysisVerifiedFindingStatus = QualityJudgeStatus;

export type SceneAnalysisVerifiedFindingCollection = VerifiedFindingCollection;

export type SemanticSceneRelationship = Readonly<{
  subject: string;
  relation: string;
  object: string;
  evidence: string | null;
}>;

export type SemanticSceneEvent = Readonly<{
  eventType: string;
  description: string;
  evidence: string;
  participants: readonly string[];
}>;

export type SemanticSceneTimelineEntry = Readonly<{
  order: number;
  description: string;
  evidence: string | null;
}>;

export type SemanticSceneModel = Readonly<{
  summary: string;
  participants: readonly string[];
  relationships: readonly SemanticSceneRelationship[];
  events: readonly SemanticSceneEvent[];
  timeline: readonly SemanticSceneTimelineEntry[];
  speakerIntent: string;
  emotionalState: string;
  victims: readonly string[];
  aggressors: readonly string[];
  targets: readonly string[];
  sensitiveConcepts: readonly string[];
  scenePurpose: string;
  sceneOutcome: string;
  confidence: number;
}>;

export type SceneAnalysisQualityJudgment = Readonly<{
  status: "pass" | "reject";
  quoteExists: boolean;
  explanationReferencesQuote: boolean;
  articleMatchesConcept: boolean;
  sceneSummarySupportsExplanation: boolean;
  explanationMentionsAnotherFinding: boolean;
  explanationInventsFacts: boolean;
  rejectionReasons: readonly string[];
}>;

export type SceneAnalysisTraceSnapshot = Readonly<{
  sceneId: string;
  status: SceneAnalysisStatus;
  sceneText: string;
  sceneModel: Readonly<{
    heading: SceneModelHeading;
    lineCount: number;
    sentenceCount: number;
    dialogueLineCount: number;
    actionLineCount: number;
    characterCount: number;
  }> | null;
  normalizedSceneText: string;
  sentenceCount: number;
  evidenceSpanCount: number;
  evidenceCollectionCount: number;
  evidenceCollectionPrimaryEvidenceId: string | null;
  evidenceCollectionDedupedCount: number;
  evidenceCollectionExecutionTimeMs: number | null;
  conceptCollectionCount: number;
  conceptCollectionPrimaryConceptId: string | null;
  conceptCollectionDedupedCount: number;
  conceptCollectionConfidence: number | null;
  conceptCollectionExecutionTimeMs: number | null;
  legalDecisionCollectionCount: number;
  legalDecisionCollectionPrimaryArticleId: number | null;
  legalDecisionCollectionSecondaryArticleIds: readonly number[];
  legalDecisionCollectionSupportingArticleIds: readonly number[];
  legalDecisionCollectionKnowledgeSource: string | null;
  legalDecisionCollectionConfidence: number | null;
  legalDecisionCollectionExecutionTimeMs: number | null;
  explanationCollectionCount: number;
  explanationCollectionPrimaryExplanationId: string | null;
  explanationCollectionRecommendedAction: SceneAnalysisExplanationRecommendedAction | null;
  explanationCollectionConfidence: number | null;
  explanationCollectionExecutionTimeMs: number | null;
  verifiedFindingCollectionCount: number;
  verifiedFindingCollectionPrimaryFindingId: string | null;
  verifiedFindingCollectionStatus: SceneAnalysisVerifiedFindingStatus | null;
  verifiedFindingCollectionConfidence: number | null;
  verifiedFindingCollectionExecutionTimeMs: number | null;
  detectedConceptIds: readonly string[];
  knowledgeDomains: readonly string[];
  legalCandidateArticleIds: readonly number[];
  legalPrimaryArticleId: number | null;
  legalSecondaryArticleIds: readonly number[];
  legalSupportingArticleIds: readonly number[];
  candidateArticleIds: readonly number[];
  rankedPrimaryArticleId: number | null;
  rankedSecondaryArticleIds: readonly number[];
  candidateAtomIds: readonly string[];
  explanationSummary: string | null;
  semanticSceneSummary: string | null;
  semanticSceneConfidence: number | null;
  semanticSceneResponseLength: number | null;
  qualityJudgmentStatus: SceneAnalysisQualityJudgment["status"] | null;
  qualityJudgmentRejectionReasons: readonly string[];
  traceLength: number;
}>;

export type SceneAnalysisTraceEntry = Readonly<{
  node: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  changedKeys: readonly string[];
  before: SceneAnalysisTraceSnapshot;
  after: SceneAnalysisTraceSnapshot;
  beforeView: SceneAnalysisTraceNodeView;
  afterView: SceneAnalysisTraceNodeView;
}>;

export type SceneAnalysisTraceNodeView = Readonly<{
  status: SceneAnalysisStatus;
  sceneSummary: string;
  evidence: readonly SceneAnalysisEvidenceSpan[];
  evidenceCollection: SceneAnalysisEvidenceCollection | null;
  conceptCollection: SceneAnalysisConceptCollection | null;
  legalDecisionCollection: SceneAnalysisLegalDecisionCollection | null;
  explanationCollection: SceneAnalysisExplanationCollection | null;
  verifiedFindingCollection: SceneAnalysisVerifiedFindingCollection | null;
  concepts: readonly SceneAnalysisConcept[];
  knowledgeDomains: readonly string[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedArticles: readonly SceneAnalysisArticleCandidate[];
  selectedArticle: SceneAnalysisArticleCandidate | null;
  explanation: SceneAnalysisExplanation | null;
  judgeResult: SceneAnalysisQualityJudgment | null;
  semanticSceneModel: SemanticSceneModel | null;
  semanticSceneResponse: string | null;
  semanticSceneDurationMs: number | null;
}>;

export type SceneAnalysisTrace = Readonly<{
  sceneId: string;
  sceneSummary: string;
  evidence: readonly SceneAnalysisEvidenceSpan[];
  evidenceCollection: SceneAnalysisEvidenceCollection | null;
  conceptCollection: SceneAnalysisConceptCollection | null;
  legalDecisionCollection: SceneAnalysisLegalDecisionCollection | null;
  explanationCollection: SceneAnalysisExplanationCollection | null;
  verifiedFindingCollection: SceneAnalysisVerifiedFindingCollection | null;
  concepts: readonly SceneAnalysisConcept[];
  knowledgeDomains: readonly string[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedArticles: readonly SceneAnalysisArticleCandidate[];
  selectedArticle: SceneAnalysisArticleCandidate | null;
  explanation: SceneAnalysisExplanation | null;
  judgeResult: SceneAnalysisQualityJudgment | null;
  semanticSceneModel: SemanticSceneModel | null;
  semanticSceneResponse: string | null;
  timing: Readonly<{
    totalMs: number;
    nodeTimings: ReadonlyArray<Readonly<{
      node: string;
      startedAt: string;
      finishedAt: string;
      durationMs: number;
    }>>;
  }>;
  nodeExecutionOrder: readonly string[];
  steps: readonly SceneAnalysisTraceEntry[];
}>;

export type SceneAnalysisState = Readonly<{
  sceneId: string;
  status: SceneAnalysisStatus;
  sceneText: string;
  sceneModel: SceneModel | null;
  normalizedSceneText: string;
  sentences: readonly SceneAnalysisSentence[];
  evidenceCollection: SceneAnalysisEvidenceCollection | null;
  conceptCollection: SceneAnalysisConceptCollection | null;
  legalDecisionCollection: SceneAnalysisLegalDecisionCollection | null;
  explanationCollection: SceneAnalysisExplanationCollection | null;
  verifiedFindingCollection: SceneAnalysisVerifiedFindingCollection | null;
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[];
  primaryEvidenceSpanId: string | null;
  primaryEvidenceText: string | null;
  primaryEvidenceReason: string | null;
  detectedConcepts: readonly SceneAnalysisConcept[];
  knowledgeDomains: readonly string[];
  legalCandidateArticles: readonly SceneAnalysisArticleCandidate[];
  legalPrimaryArticle: SceneAnalysisArticleCandidate | null;
  legalSecondaryArticles: readonly SceneAnalysisArticleCandidate[];
  legalSupportingArticles: readonly SceneAnalysisArticleCandidate[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedCandidateArticles: readonly SceneAnalysisArticleCandidate[];
  primaryArticle: SceneAnalysisArticleCandidate | null;
  secondaryArticles: readonly SceneAnalysisArticleCandidate[];
  candidateAtoms: readonly SceneAnalysisAtomCandidate[];
  rankedCandidateAtoms: readonly SceneAnalysisAtomCandidate[];
  semanticSceneModel: SemanticSceneModel | null;
  semanticSceneResponse: string | null;
  semanticSceneDurationMs: number | null;
  explanation: SceneAnalysisExplanation | null;
  qualityJudgment: SceneAnalysisQualityJudgment | null;
  trace: readonly SceneAnalysisTraceEntry[];
}>;

function deepFreeze<T>(value: T, seen: WeakSet<object> = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const objectValue = value as unknown as object;
  if (seen.has(objectValue)) {
    return value;
  }
  seen.add(objectValue);

  for (const key of Object.keys(objectValue)) {
    const child = (objectValue as Record<string, unknown>)[key];
    if (child !== null && typeof child === "object") {
      deepFreeze(child, seen);
    }
  }

  return Object.freeze(value);
}

function freezeReadonlyArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

export function createSceneAnalysisState(input: Readonly<{
  sceneId: string;
  sceneText: string;
}>): SceneAnalysisState {
  return freezeSceneAnalysisState({
    sceneId: input.sceneId,
    status: "pending",
    sceneText: input.sceneText,
    sceneModel: null,
    normalizedSceneText: "",
    sentences: freezeReadonlyArray([]),
    evidenceCollection: null,
    conceptCollection: null,
  legalDecisionCollection: null,
  explanationCollection: null,
  verifiedFindingCollection: null,
  evidenceSpans: freezeReadonlyArray([]),
    primaryEvidenceSpanId: null,
    primaryEvidenceText: null,
    primaryEvidenceReason: null,
    detectedConcepts: freezeReadonlyArray([]),
    knowledgeDomains: freezeReadonlyArray([]),
    legalCandidateArticles: freezeReadonlyArray([]),
    legalPrimaryArticle: null,
    legalSecondaryArticles: freezeReadonlyArray([]),
    legalSupportingArticles: freezeReadonlyArray([]),
    candidateArticles: freezeReadonlyArray([]),
    rankedCandidateArticles: freezeReadonlyArray([]),
    primaryArticle: null,
    secondaryArticles: freezeReadonlyArray([]),
    candidateAtoms: freezeReadonlyArray([]),
    rankedCandidateAtoms: freezeReadonlyArray([]),
    semanticSceneModel: null,
    semanticSceneResponse: null,
    semanticSceneDurationMs: null,
    explanation: null,
    qualityJudgment: null,
    trace: freezeReadonlyArray([]),
  });
}

export function freezeSceneAnalysisState(state: SceneAnalysisState | Readonly<Record<string, unknown>>): SceneAnalysisState {
  return deepFreeze({
    ...state,
    sceneModel: (state as SceneAnalysisState).sceneModel
      ? {
          ...((state as SceneAnalysisState).sceneModel as SceneModel),
          heading: { ...((state as SceneAnalysisState).sceneModel as SceneModel).heading },
        }
      : null,
    sentences: freezeReadonlyArray((state as SceneAnalysisState).sentences ?? []),
    evidenceCollection: (state as SceneAnalysisState).evidenceCollection
      ? deepFreeze({
          ...(state as SceneAnalysisState).evidenceCollection,
          evidence: freezeReadonlyArray((state as SceneAnalysisState).evidenceCollection?.evidence ?? []),
          dedupDecisions: freezeReadonlyArray((state as SceneAnalysisState).evidenceCollection?.dedupDecisions ?? []),
        }) as SceneAnalysisEvidenceCollection
      : null,
    conceptCollection: (state as SceneAnalysisState).conceptCollection
      ? deepFreeze({
          ...(state as SceneAnalysisState).conceptCollection,
          concepts: freezeReadonlyArray((state as SceneAnalysisState).conceptCollection?.concepts ?? []),
          dedupDecisions: freezeReadonlyArray((state as SceneAnalysisState).conceptCollection?.dedupDecisions ?? []),
          normalization: freezeReadonlyArray((state as SceneAnalysisState).conceptCollection?.normalization ?? []),
          classificationOutput: freezeReadonlyArray((state as SceneAnalysisState).conceptCollection?.classificationOutput ?? []),
        }) as SceneAnalysisConceptCollection
      : null,
    legalDecisionCollection: (state as SceneAnalysisState).legalDecisionCollection
      ? deepFreeze({
          ...(state as SceneAnalysisState).legalDecisionCollection,
          conceptIds: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.conceptIds ?? []),
          decisions: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.decisions ?? []),
          candidateArticles: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.candidateArticles ?? []),
          rankedCandidateArticles: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.rankedCandidateArticles ?? []),
          secondaryArticles: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.secondaryArticles ?? []),
          supportingArticles: freezeReadonlyArray((state as SceneAnalysisState).legalDecisionCollection?.supportingArticles ?? []),
        }) as SceneAnalysisLegalDecisionCollection
      : null,
    explanationCollection: (state as SceneAnalysisState).explanationCollection
      ? deepFreeze({
          ...(state as SceneAnalysisState).explanationCollection,
          explanations: freezeReadonlyArray((state as SceneAnalysisState).explanationCollection?.explanations ?? []),
        }) as SceneAnalysisExplanationCollection
      : null,
    verifiedFindingCollection: (state as SceneAnalysisState).verifiedFindingCollection
      ? deepFreeze({
          ...(state as SceneAnalysisState).verifiedFindingCollection,
          verifiedFindings: freezeReadonlyArray((state as SceneAnalysisState).verifiedFindingCollection?.verifiedFindings ?? []),
          ruleEvaluations: freezeReadonlyArray((state as SceneAnalysisState).verifiedFindingCollection?.ruleEvaluations ?? []),
          report: deepFreeze({
            ...(state as SceneAnalysisState).verifiedFindingCollection?.report,
            ruleEvaluations: freezeReadonlyArray((state as SceneAnalysisState).verifiedFindingCollection?.report.ruleEvaluations ?? []),
            rejectionReasons: freezeReadonlyArray((state as SceneAnalysisState).verifiedFindingCollection?.report.rejectionReasons ?? []),
          }),
        }) as SceneAnalysisVerifiedFindingCollection
      : null,
    evidenceSpans: freezeReadonlyArray((state as SceneAnalysisState).evidenceSpans ?? []),
    detectedConcepts: freezeReadonlyArray((state as SceneAnalysisState).detectedConcepts ?? []),
    knowledgeDomains: freezeReadonlyArray((state as SceneAnalysisState).knowledgeDomains ?? []),
    legalCandidateArticles: freezeReadonlyArray((state as SceneAnalysisState).legalCandidateArticles ?? []),
    legalPrimaryArticle: (state as SceneAnalysisState).legalPrimaryArticle ?? null,
    legalSecondaryArticles: freezeReadonlyArray((state as SceneAnalysisState).legalSecondaryArticles ?? []),
    legalSupportingArticles: freezeReadonlyArray((state as SceneAnalysisState).legalSupportingArticles ?? []),
    candidateArticles: freezeReadonlyArray((state as SceneAnalysisState).candidateArticles ?? []),
    rankedCandidateArticles: freezeReadonlyArray((state as SceneAnalysisState).rankedCandidateArticles ?? []),
    secondaryArticles: freezeReadonlyArray((state as SceneAnalysisState).secondaryArticles ?? []),
    candidateAtoms: freezeReadonlyArray((state as SceneAnalysisState).candidateAtoms ?? []),
    rankedCandidateAtoms: freezeReadonlyArray((state as SceneAnalysisState).rankedCandidateAtoms ?? []),
    semanticSceneModel: (state as SceneAnalysisState).semanticSceneModel ?? null,
    semanticSceneResponse: (state as SceneAnalysisState).semanticSceneResponse ?? null,
    semanticSceneDurationMs: (state as SceneAnalysisState).semanticSceneDurationMs ?? null,
    trace: freezeReadonlyArray((state as SceneAnalysisState).trace ?? []),
    explanation: (state as SceneAnalysisState).explanation ?? null,
    qualityJudgment: (state as SceneAnalysisState).qualityJudgment ?? null,
    primaryArticle: (state as SceneAnalysisState).primaryArticle ?? null,
  } as SceneAnalysisState);
}

export function snapshotSceneAnalysisState(state: SceneAnalysisState): SceneAnalysisTraceSnapshot {
  return deepFreeze({
    sceneId: state.sceneId,
    status: state.status,
    sceneText: state.sceneText,
    sceneModel: state.sceneModel
      ? Object.freeze({
          heading: Object.freeze({ ...state.sceneModel.heading }),
          lineCount: state.sceneModel.lines.length,
          sentenceCount: state.sceneModel.sentences.length,
          dialogueLineCount: state.sceneModel.dialogueLines.length,
          actionLineCount: state.sceneModel.actionLines.length,
          characterCount: state.sceneModel.characters.length,
        })
      : null,
    normalizedSceneText: state.normalizedSceneText,
    sentenceCount: state.sentences.length,
    evidenceSpanCount: state.evidenceSpans.length,
    evidenceCollectionCount: state.evidenceCollection?.evidence.length ?? 0,
    evidenceCollectionPrimaryEvidenceId: state.evidenceCollection?.primaryEvidenceId ?? null,
    evidenceCollectionDedupedCount: state.evidenceCollection?.dedupDecisions.length ?? 0,
    evidenceCollectionExecutionTimeMs: state.evidenceCollection?.executionTimeMs ?? null,
    conceptCollectionCount: state.conceptCollection?.concepts.length ?? 0,
    conceptCollectionPrimaryConceptId: state.conceptCollection?.concepts[0]?.conceptId ?? null,
    conceptCollectionDedupedCount: state.conceptCollection?.dedupDecisions.length ?? 0,
    conceptCollectionConfidence: state.conceptCollection?.confidence ?? null,
    conceptCollectionExecutionTimeMs: state.conceptCollection?.executionTimeMs ?? null,
    legalDecisionCollectionCount: state.legalDecisionCollection?.decisions.length ?? 0,
    legalDecisionCollectionPrimaryArticleId: state.legalDecisionCollection?.primaryArticle?.articleId ?? null,
    legalDecisionCollectionSecondaryArticleIds: freezeReadonlyArray(state.legalDecisionCollection?.secondaryArticles.map((candidate) => candidate.articleId) ?? []),
    legalDecisionCollectionSupportingArticleIds: freezeReadonlyArray(state.legalDecisionCollection?.supportingArticles.map((candidate) => candidate.articleId) ?? []),
    legalDecisionCollectionKnowledgeSource: state.legalDecisionCollection?.knowledgeSource ?? null,
    legalDecisionCollectionConfidence: state.legalDecisionCollection?.confidence ?? null,
    legalDecisionCollectionExecutionTimeMs: state.legalDecisionCollection?.executionTimeMs ?? null,
    explanationCollectionCount: state.explanationCollection?.explanations.length ?? 0,
    explanationCollectionPrimaryExplanationId: state.explanationCollection?.primaryExplanationId ?? null,
    explanationCollectionRecommendedAction: state.explanationCollection?.primaryExplanation?.recommendedAction ?? null,
    explanationCollectionConfidence: state.explanationCollection?.confidence ?? null,
    explanationCollectionExecutionTimeMs: state.explanationCollection?.executionTimeMs ?? null,
    verifiedFindingCollectionCount: state.verifiedFindingCollection?.verifiedFindings.length ?? 0,
    verifiedFindingCollectionPrimaryFindingId: state.verifiedFindingCollection?.primaryVerifiedFindingId ?? null,
    verifiedFindingCollectionStatus: state.verifiedFindingCollection?.report.overallStatus ?? null,
    verifiedFindingCollectionConfidence: state.verifiedFindingCollection?.confidence ?? null,
    verifiedFindingCollectionExecutionTimeMs: state.verifiedFindingCollection?.executionTimeMs ?? null,
    detectedConceptIds: freezeReadonlyArray(state.detectedConcepts.map((concept) => concept.conceptId)),
    knowledgeDomains: freezeReadonlyArray(state.knowledgeDomains),
    legalCandidateArticleIds: freezeReadonlyArray(state.legalCandidateArticles.map((candidate) => candidate.articleId)),
    legalPrimaryArticleId: state.legalPrimaryArticle?.articleId ?? null,
    legalSecondaryArticleIds: freezeReadonlyArray(state.legalSecondaryArticles.map((candidate) => candidate.articleId)),
    legalSupportingArticleIds: freezeReadonlyArray(state.legalSupportingArticles.map((candidate) => candidate.articleId)),
    candidateArticleIds: freezeReadonlyArray(state.candidateArticles.map((candidate) => candidate.articleId)),
    rankedPrimaryArticleId: state.primaryArticle?.articleId ?? null,
    rankedSecondaryArticleIds: freezeReadonlyArray(state.secondaryArticles.map((candidate) => candidate.articleId)),
    candidateAtomIds: freezeReadonlyArray(state.candidateAtoms.map((candidate) => candidate.atomId)),
    explanationSummary: state.explanation?.summary ?? null,
    semanticSceneSummary: state.semanticSceneModel?.summary ?? null,
    semanticSceneConfidence: state.semanticSceneModel?.confidence ?? null,
    semanticSceneResponseLength: state.semanticSceneResponse?.length ?? null,
    qualityJudgmentStatus: state.qualityJudgment?.status ?? null,
    qualityJudgmentRejectionReasons: freezeReadonlyArray(state.qualityJudgment?.rejectionReasons ?? []),
    traceLength: state.trace.length,
  } satisfies SceneAnalysisTraceSnapshot);
}

