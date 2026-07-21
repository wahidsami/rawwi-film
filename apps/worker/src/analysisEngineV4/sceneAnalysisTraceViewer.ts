import type {
  SceneAnalysisState,
  SceneAnalysisTrace,
  SceneAnalysisTraceEntry,
  SceneAnalysisTraceNodeView,
} from "./sceneAnalysisState.js";

function freezeTraceNodeView(view: SceneAnalysisTraceNodeView): SceneAnalysisTraceNodeView {
  return Object.freeze({
    ...view,
  });
}

function freezeTraceEntries(entries: readonly SceneAnalysisTraceEntry[]): readonly SceneAnalysisTraceEntry[] {
  return Object.freeze([...entries]);
}

export function createSceneAnalysisTraceNodeView(state: SceneAnalysisState): SceneAnalysisTraceNodeView {
  return freezeTraceNodeView({
    status: state.status,
    sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    evidence: state.evidenceSpans,
    concepts: state.detectedConcepts,
    knowledgeDomains: state.knowledgeDomains,
    candidateArticles: state.candidateArticles,
    rankedArticles: state.rankedCandidateArticles,
    selectedArticle: state.primaryArticle,
    semanticSceneModel: state.semanticSceneModel,
    semanticSceneResponse: state.semanticSceneResponse,
    semanticSceneDurationMs: null,
    explanation: state.explanation,
    judgeResult: state.qualityJudgment,
  });
}

export function buildSceneAnalysisTrace(state: SceneAnalysisState): SceneAnalysisTrace {
  const steps = freezeTraceEntries(state.trace);
  const nodeTimings = Object.freeze(steps.map((entry) => Object.freeze({
    node: entry.node,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
  })));
  return Object.freeze({
    sceneId: state.sceneId,
    sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    evidence: state.evidenceSpans,
    concepts: state.detectedConcepts,
    knowledgeDomains: state.knowledgeDomains,
    candidateArticles: state.candidateArticles,
    rankedArticles: state.rankedCandidateArticles,
    selectedArticle: state.primaryArticle,
    semanticSceneModel: state.semanticSceneModel,
    semanticSceneResponse: state.semanticSceneResponse,
    explanation: state.explanation,
    judgeResult: state.qualityJudgment,
    timing: Object.freeze({
      totalMs: steps.reduce((total, entry) => total + entry.durationMs, 0),
      nodeTimings,
    }),
    nodeExecutionOrder: Object.freeze(steps.map((entry) => entry.node)),
    steps,
  });
}

export type SceneAnalysisTraceDocumentStep = Readonly<{
  node: string;
  durationMs: number;
  changedKeys: readonly string[];
  before: SceneAnalysisTraceNodeView;
  after: SceneAnalysisTraceNodeView;
}>;

export type SceneAnalysisTraceDocument = Readonly<{
  sceneId: string;
  sceneSummary: string;
  evidence: SceneAnalysisTraceNodeView["evidence"];
  concepts: SceneAnalysisTraceNodeView["concepts"];
  knowledgeDomains: readonly string[];
  candidateArticles: SceneAnalysisTraceNodeView["candidateArticles"];
  rankedArticles: SceneAnalysisTraceNodeView["rankedArticles"];
  selectedArticle: SceneAnalysisTraceNodeView["selectedArticle"];
  semanticSceneModel: SceneAnalysisTraceNodeView["semanticSceneModel"];
  semanticSceneResponse: SceneAnalysisTraceNodeView["semanticSceneResponse"];
  explanation: SceneAnalysisTraceNodeView["explanation"];
  judgeResult: SceneAnalysisTraceNodeView["judgeResult"];
  timing: Readonly<{
    totalMs: number;
    nodeTimings: ReadonlyArray<Readonly<{
      node: string;
      durationMs: number;
    }>>;
  }>;
  nodeExecutionOrder: readonly string[];
  steps: readonly SceneAnalysisTraceDocumentStep[];
}>;

export type SceneAnalysisTraceReplay = Readonly<{
  sceneId: string;
  sceneSummary: string;
  startingNode: string | null;
  startingNodeIndex: number;
  nodeExecutionOrder: readonly string[];
  remainingNodeExecutionOrder: readonly string[];
  steps: readonly SceneAnalysisTraceEntry[];
  startingView: SceneAnalysisTraceNodeView;
}>;

export function replaySceneAnalysisTrace(trace: SceneAnalysisTrace, fromNode: string | number): SceneAnalysisTraceReplay {
  const startIndex = typeof fromNode === "number"
    ? Math.max(0, Math.min(trace.steps.length, Math.trunc(fromNode)))
    : Math.max(0, trace.steps.findIndex((entry) => entry.node === fromNode));
  const normalizedStartIndex = startIndex < 0 ? 0 : startIndex;
  const startingView = normalizedStartIndex === 0
    ? createSceneAnalysisTraceNodeView({
        sceneId: trace.sceneId,
        status: trace.steps[0]?.beforeView.status ?? "pending",
        sceneText: trace.sceneSummary,
        sceneModel: null,
        normalizedSceneText: trace.sceneSummary,
        sentences: [],
        evidenceSpans: trace.evidence,
        primaryEvidenceSpanId: null,
        primaryEvidenceText: null,
        primaryEvidenceReason: null,
        detectedConcepts: trace.concepts,
        knowledgeDomains: trace.knowledgeDomains,
        legalCandidateArticles: trace.candidateArticles,
        legalPrimaryArticle: trace.selectedArticle ?? null,
        legalSecondaryArticles: [],
        legalSupportingArticles: [],
        candidateArticles: trace.candidateArticles,
        rankedCandidateArticles: trace.rankedArticles,
        primaryArticle: trace.selectedArticle ?? null,
        secondaryArticles: [],
        candidateAtoms: [],
        rankedCandidateAtoms: [],
        semanticSceneModel: trace.semanticSceneModel,
        semanticSceneResponse: trace.semanticSceneResponse,
        semanticSceneDurationMs: null,
        explanation: trace.explanation,
        qualityJudgment: trace.judgeResult,
        trace: [],
      })
    : trace.steps[normalizedStartIndex - 1]?.afterView ?? trace.steps[0]?.beforeView ?? createSceneAnalysisTraceNodeView({
        sceneId: trace.sceneId,
        status: "pending",
        sceneText: trace.sceneSummary,
        sceneModel: null,
        normalizedSceneText: trace.sceneSummary,
        sentences: [],
        evidenceSpans: trace.evidence,
        primaryEvidenceSpanId: null,
        primaryEvidenceText: null,
        primaryEvidenceReason: null,
        detectedConcepts: trace.concepts,
        knowledgeDomains: trace.knowledgeDomains,
        legalCandidateArticles: trace.candidateArticles,
        legalPrimaryArticle: trace.selectedArticle ?? null,
        legalSecondaryArticles: [],
        legalSupportingArticles: [],
        candidateArticles: trace.candidateArticles,
        rankedCandidateArticles: trace.rankedArticles,
        primaryArticle: trace.selectedArticle ?? null,
        secondaryArticles: [],
        candidateAtoms: [],
        rankedCandidateAtoms: [],
        semanticSceneModel: trace.semanticSceneModel,
        semanticSceneResponse: trace.semanticSceneResponse,
        semanticSceneDurationMs: null,
        explanation: trace.explanation,
        qualityJudgment: trace.judgeResult,
        trace: [],
      });

  return Object.freeze({
    sceneId: trace.sceneId,
    sceneSummary: trace.sceneSummary,
    startingNode: trace.steps[normalizedStartIndex]?.node ?? null,
    startingNodeIndex: normalizedStartIndex,
    nodeExecutionOrder: trace.nodeExecutionOrder,
    remainingNodeExecutionOrder: Object.freeze(trace.nodeExecutionOrder.slice(normalizedStartIndex)),
    steps: freezeTraceEntries(trace.steps.slice(normalizedStartIndex)),
    startingView,
  });
}

export function serializeSceneAnalysisTrace(trace: SceneAnalysisTrace): string {
  return `${JSON.stringify(trace, null, 2)}\n`;
}

export function createSceneAnalysisTraceDocument(trace: SceneAnalysisTrace): SceneAnalysisTraceDocument {
  const nodeTimings = trace.timing.nodeTimings.map((entry, index) => Object.freeze({
    node: entry.node,
    durationMs: index + 1,
  }));
  const steps = trace.steps.map((entry, index) => Object.freeze({
    node: entry.node,
    durationMs: index + 1,
    changedKeys: entry.changedKeys,
    before: entry.beforeView,
    after: entry.afterView,
  }));
  return Object.freeze({
    sceneId: trace.sceneId,
    sceneSummary: trace.sceneSummary,
    evidence: trace.evidence,
    concepts: trace.concepts,
    knowledgeDomains: trace.knowledgeDomains,
    candidateArticles: trace.candidateArticles,
    rankedArticles: trace.rankedArticles,
    selectedArticle: trace.selectedArticle,
    semanticSceneModel: trace.semanticSceneModel,
    semanticSceneResponse: trace.semanticSceneResponse,
    explanation: trace.explanation,
    judgeResult: trace.judgeResult,
    timing: Object.freeze({
      totalMs: steps.length,
      nodeTimings: Object.freeze(nodeTimings),
    }),
    nodeExecutionOrder: trace.nodeExecutionOrder,
    steps: Object.freeze(steps),
  });
}

export function serializeSceneAnalysisTraceDocument(document: SceneAnalysisTraceDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

