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

export type SceneEvidencePageReference = Readonly<{
  pageNumber: number;
  startOffsetPage: number;
  endOffsetPage: number;
}>;

export type SceneAnalysisSentence = Readonly<{
  sentenceId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  sourceType: "dialogue" | "scene_description" | "story_context";
}>;

export type SceneAnalysisEvidenceSpan = Readonly<{
  spanId: string;
  text: string;
  startOffset: number;
  endOffset: number;
  lineId: string;
  sentenceIndex: number;
  sourceType: "dialogue" | "scene_description" | "story_context";
  pageReferences: readonly SceneEvidencePageReference[];
  conceptIds: readonly string[];
  confidence: number;
  rationale: readonly string[];
}>;

export type SceneAnalysisConcept = Readonly<{
  conceptId: string;
  label: string;
  knowledgeDomains: readonly string[];
  evidenceSpanIds: readonly string[];
  confidence: number;
  rationale: readonly string[];
}>;

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
  concepts: readonly SceneAnalysisConcept[];
  knowledgeDomains: readonly string[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedArticles: readonly SceneAnalysisArticleCandidate[];
  selectedArticle: SceneAnalysisArticleCandidate | null;
  explanation: SceneAnalysisExplanation | null;
  judgeResult: SceneAnalysisQualityJudgment | null;
}>;

export type SceneAnalysisTrace = Readonly<{
  sceneId: string;
  sceneSummary: string;
  evidence: readonly SceneAnalysisEvidenceSpan[];
  concepts: readonly SceneAnalysisConcept[];
  knowledgeDomains: readonly string[];
  candidateArticles: readonly SceneAnalysisArticleCandidate[];
  rankedArticles: readonly SceneAnalysisArticleCandidate[];
  selectedArticle: SceneAnalysisArticleCandidate | null;
  explanation: SceneAnalysisExplanation | null;
  judgeResult: SceneAnalysisQualityJudgment | null;
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
    qualityJudgmentStatus: state.qualityJudgment?.status ?? null,
    qualityJudgmentRejectionReasons: freezeReadonlyArray(state.qualityJudgment?.rejectionReasons ?? []),
    traceLength: state.trace.length,
  } satisfies SceneAnalysisTraceSnapshot);
}

