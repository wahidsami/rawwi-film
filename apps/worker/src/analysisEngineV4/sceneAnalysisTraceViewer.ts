import type {
  SceneAnalysisConceptCollection,
  SceneAnalysisExplanationCollection,
  SceneAnalysisLegalDecisionCollection,
  SceneAnalysisVerifiedFindingCollection,
  SceneAnalysisState,
  SceneAnalysisEvidenceCollection,
  SceneAnalysisTrace,
  SceneAnalysisTraceEntry,
  SceneAnalysisTraceNodeView,
} from "./sceneAnalysisState.js";
import type { DecisionProvenanceCollection } from "./provenance/decisionProvenanceTypes.js";
import { buildDecisionProvenanceCollection } from "./provenance/decisionProvenanceBuilder.js";
import { normalizeDecisionProvenanceCollectionForDocument } from "./provenance/decisionProvenanceSerializer.js";
import { createTruthVerificationSummary, type FindingTruth, type FindingTruthNodeVerification, type TruthVerificationSummary } from "./truthVerification.js";
import { buildFindingProbeTrace, type FindingProbeTrace } from "./findingProbe.js";

function freezeTraceNodeView(view: SceneAnalysisTraceNodeView): SceneAnalysisTraceNodeView {
  return Object.freeze({
    ...view,
  });
}

function freezeFindingTruth(truth: FindingTruth | null): FindingTruth | null {
  return truth ? Object.freeze({ ...truth }) : null;
}

function freezeTruthVerification(verification: FindingTruthNodeVerification): FindingTruthNodeVerification {
  return Object.freeze({
    ...verification,
    input: Object.freeze({ ...verification.input }),
    output: Object.freeze({ ...verification.output }),
  });
}

function freezeTraceEntries(entries: readonly SceneAnalysisTraceEntry[]): readonly SceneAnalysisTraceEntry[] {
  return Object.freeze([...entries]);
}

function normalizeEvidenceCollectionForDocument(collection: SceneAnalysisEvidenceCollection | null): SceneAnalysisEvidenceCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    evidence: Object.freeze([...collection.evidence]),
    dedupDecisions: Object.freeze([...collection.dedupDecisions]),
    grounding: Object.freeze({
      ...collection.grounding,
    }),
  });
}

function normalizeConceptCollectionForDocument(collection: SceneAnalysisConceptCollection | null): SceneAnalysisConceptCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    concepts: Object.freeze([...collection.concepts]),
    dedupDecisions: Object.freeze([...collection.dedupDecisions]),
    normalization: Object.freeze([...collection.normalization]),
    classificationOutput: Object.freeze([...collection.classificationOutput]),
  });
}

function normalizeLegalDecisionCollectionForDocument(collection: SceneAnalysisLegalDecisionCollection | null): SceneAnalysisLegalDecisionCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    conceptIds: Object.freeze([...collection.conceptIds]),
    decisions: Object.freeze([...collection.decisions]),
    candidateArticles: Object.freeze([...collection.candidateArticles]),
    rankedCandidateArticles: Object.freeze([...collection.rankedCandidateArticles]),
    secondaryArticles: Object.freeze([...collection.secondaryArticles]),
    supportingArticles: Object.freeze([...collection.supportingArticles]),
  });
}

function normalizeExplanationCollectionForDocument(collection: SceneAnalysisExplanationCollection | null): SceneAnalysisExplanationCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    explanations: Object.freeze([...collection.explanations]),
  });
}

function normalizeVerifiedFindingCollectionForDocument(collection: SceneAnalysisVerifiedFindingCollection | null): SceneAnalysisVerifiedFindingCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    verifiedFindings: Object.freeze([...collection.verifiedFindings]),
    ruleEvaluations: Object.freeze([...collection.ruleEvaluations]),
    report: Object.freeze({
      ...collection.report,
      ruleEvaluations: Object.freeze([...collection.report.ruleEvaluations]),
      rejectionReasons: Object.freeze([...collection.report.rejectionReasons]),
    }),
  });
}

export type SceneAnalysisTraceWithProvenance = SceneAnalysisTrace & Readonly<{
  decisionProvenanceCollection: DecisionProvenanceCollection | null;
  findingProbe: FindingProbeTrace | null;
}>;

function createDecisionProvenanceCollectionFromState(state: SceneAnalysisState): DecisionProvenanceCollection | null {
  if (!state.verifiedFindingCollection || state.verifiedFindingCollection.verifiedFindings.length === 0) {
    return null;
  }

  return buildDecisionProvenanceCollection({
    sceneId: state.sceneId,
    evidenceCollection: state.evidenceCollection,
    conceptCollection: state.conceptCollection,
    legalDecisionCollection: state.legalDecisionCollection,
    explanationCollection: state.explanationCollection,
    verifiedFindingCollection: state.verifiedFindingCollection,
  });
}

function normalizeTraceNodeViewForDocument(view: SceneAnalysisTraceNodeView): SceneAnalysisTraceNodeView {
  return freezeTraceNodeView({
    ...view,
    findingTruth: freezeFindingTruth(view.findingTruth),
    verificationTrail: Object.freeze([...view.verificationTrail]),
    evidenceCollection: normalizeEvidenceCollectionForDocument(view.evidenceCollection),
    conceptCollection: normalizeConceptCollectionForDocument(view.conceptCollection),
    legalDecisionCollection: normalizeLegalDecisionCollectionForDocument(view.legalDecisionCollection),
    explanationCollection: normalizeExplanationCollectionForDocument(view.explanationCollection),
    verifiedFindingCollection: normalizeVerifiedFindingCollectionForDocument(view.verifiedFindingCollection),
  });
}

export function createSceneAnalysisTraceNodeView(state: SceneAnalysisState): SceneAnalysisTraceNodeView {
  return freezeTraceNodeView({
    status: state.status,
    sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    evidence: state.evidenceSpans,
    evidenceCollection: state.evidenceCollection,
    verifiedEvidence: state.verifiedEvidence,
    conceptCollection: state.conceptCollection,
    legalDecisionCollection: state.legalDecisionCollection,
    explanationCollection: state.explanationCollection,
    verifiedFindingCollection: state.verifiedFindingCollection,
    concepts: state.detectedConcepts,
    knowledgeDomains: state.knowledgeDomains,
    candidateArticles: state.candidateArticles,
    rankedArticles: state.rankedCandidateArticles,
    selectedArticle: state.primaryArticle,
    semanticSceneModel: state.semanticSceneModel,
    semanticSceneResponse: state.semanticSceneResponse,
    semanticSceneDurationMs: null,
    findingTruth: state.findingTruth,
    verificationTrail: state.verificationTrail,
    explanation: state.explanation,
    judgeResult: state.qualityJudgment,
  });
}

export function buildSceneAnalysisTrace(state: SceneAnalysisState): SceneAnalysisTraceWithProvenance {
  const steps = freezeTraceEntries(state.trace);
  const verificationSummary = createTruthVerificationSummary(steps.map((entry) => entry.verification));
  const nodeTimings = Object.freeze(steps.map((entry) => Object.freeze({
    node: entry.node,
    startedAt: entry.startedAt,
    finishedAt: entry.finishedAt,
    durationMs: entry.durationMs,
  })));
  const decisionProvenanceCollection = createDecisionProvenanceCollectionFromState(state);
  const findingProbe = buildFindingProbeTrace({
    steps,
    findingTruth: state.findingTruth,
  });
  return Object.freeze({
    sceneId: state.sceneId,
    sceneSummary: state.sceneModel?.summary ?? state.normalizedSceneText ?? state.sceneText,
    evidence: state.evidenceSpans,
    evidenceCollection: state.evidenceCollection,
    conceptCollection: state.conceptCollection,
    legalDecisionCollection: state.legalDecisionCollection,
    explanationCollection: state.explanationCollection,
    verifiedFindingCollection: state.verifiedFindingCollection,
    decisionProvenanceCollection,
    concepts: state.detectedConcepts,
    knowledgeDomains: state.knowledgeDomains,
    candidateArticles: state.candidateArticles,
    rankedArticles: state.rankedCandidateArticles,
    selectedArticle: state.primaryArticle,
    semanticSceneModel: state.semanticSceneModel,
    semanticSceneResponse: state.semanticSceneResponse,
    findingTruth: state.findingTruth,
    explanation: state.explanation,
    judgeResult: state.qualityJudgment,
    verificationTrail: state.verificationTrail,
    verificationSummary,
    timing: Object.freeze({
      totalMs: steps.reduce((total, entry) => total + entry.durationMs, 0),
      nodeTimings,
    }),
    nodeExecutionOrder: Object.freeze(steps.map((entry) => entry.node)),
    steps,
    findingProbe,
  });
}

function freezeFindingProbeTrace(trace: FindingProbeTrace | null): FindingProbeTrace | null {
  if (!trace) {
    return null;
  }

  return Object.freeze({
    ...trace,
    selection: Object.freeze({
      ...trace.selection,
    }),
    steps: Object.freeze(trace.steps.map((step) => Object.freeze({
      ...step,
      mutation: step.mutation
        ? Object.freeze({
            ...step.mutation,
          })
        : null,
    }))),
  });
}

export type SceneAnalysisTraceDocumentStep = Readonly<{
  node: string;
  durationMs: number;
  changedKeys: readonly string[];
  before: SceneAnalysisTraceNodeView;
  after: SceneAnalysisTraceNodeView;
  verification: FindingTruthNodeVerification;
}>;

export type SceneAnalysisTraceDocument = Readonly<{
  sceneId: string;
  sceneSummary: string;
  evidence: SceneAnalysisTraceNodeView["evidence"];
  evidenceCollection: SceneAnalysisEvidenceCollection | null;
  conceptCollection: SceneAnalysisConceptCollection | null;
  legalDecisionCollection: SceneAnalysisLegalDecisionCollection | null;
  explanationCollection: SceneAnalysisExplanationCollection | null;
  verifiedFindingCollection: SceneAnalysisVerifiedFindingCollection | null;
  decisionProvenanceCollection: DecisionProvenanceCollection | null;
  concepts: SceneAnalysisTraceNodeView["concepts"];
  knowledgeDomains: readonly string[];
  candidateArticles: SceneAnalysisTraceNodeView["candidateArticles"];
  rankedArticles: SceneAnalysisTraceNodeView["rankedArticles"];
  selectedArticle: SceneAnalysisTraceNodeView["selectedArticle"];
  semanticSceneModel: SceneAnalysisTraceNodeView["semanticSceneModel"];
  semanticSceneResponse: SceneAnalysisTraceNodeView["semanticSceneResponse"];
  findingTruth: FindingTruth | null;
  verificationTrail: readonly FindingTruthNodeVerification[];
  explanation: SceneAnalysisTraceNodeView["explanation"];
  judgeResult: SceneAnalysisTraceNodeView["judgeResult"];
  verificationSummary: TruthVerificationSummary | null;
  timing: Readonly<{
    totalMs: number;
    nodeTimings: ReadonlyArray<Readonly<{
      node: string;
      durationMs: number;
    }>>;
  }>;
  nodeExecutionOrder: readonly string[];
  steps: readonly SceneAnalysisTraceDocumentStep[];
  findingProbe?: FindingProbeTrace | null;
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
        evidenceCollection: trace.evidenceCollection,
        verifiedEvidence: null,
        conceptCollection: trace.conceptCollection,
        legalDecisionCollection: trace.legalDecisionCollection,
        explanationCollection: trace.explanationCollection,
        verifiedFindingCollection: trace.verifiedFindingCollection,
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
        findingTruth: trace.findingTruth ?? null,
        verificationTrail: trace.verificationTrail,
        verificationSummary: trace.verificationSummary,
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
        evidenceCollection: trace.evidenceCollection,
        verifiedEvidence: null,
        conceptCollection: trace.conceptCollection,
        legalDecisionCollection: trace.legalDecisionCollection,
        explanationCollection: trace.explanationCollection,
        verifiedFindingCollection: trace.verifiedFindingCollection,
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
        findingTruth: trace.findingTruth ?? null,
        verificationTrail: trace.verificationTrail,
        verificationSummary: trace.verificationSummary,
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

export function createSceneAnalysisTraceDocument(trace: SceneAnalysisTraceWithProvenance): SceneAnalysisTraceDocument {
  const nodeTimings = trace.timing.nodeTimings.map((entry, index) => Object.freeze({
    node: entry.node,
    durationMs: index + 1,
  }));
  const steps = trace.steps.map((entry, index) => Object.freeze({
    node: entry.node,
    durationMs: index + 1,
    changedKeys: entry.changedKeys,
    before: normalizeTraceNodeViewForDocument(entry.beforeView),
    after: normalizeTraceNodeViewForDocument(entry.afterView),
    verification: freezeTruthVerification(entry.verification),
  }));
  return Object.freeze({
    sceneId: trace.sceneId,
    sceneSummary: trace.sceneSummary,
    evidence: trace.evidence,
    evidenceCollection: normalizeEvidenceCollectionForDocument(trace.evidenceCollection),
    conceptCollection: normalizeConceptCollectionForDocument(trace.conceptCollection),
    legalDecisionCollection: normalizeLegalDecisionCollectionForDocument(trace.legalDecisionCollection),
    explanationCollection: normalizeExplanationCollectionForDocument(trace.explanationCollection),
    verifiedFindingCollection: normalizeVerifiedFindingCollectionForDocument(trace.verifiedFindingCollection),
    decisionProvenanceCollection: normalizeDecisionProvenanceCollectionForDocument(trace.decisionProvenanceCollection),
    concepts: trace.concepts,
    knowledgeDomains: trace.knowledgeDomains,
    candidateArticles: trace.candidateArticles,
    rankedArticles: trace.rankedArticles,
    selectedArticle: trace.selectedArticle,
    semanticSceneModel: trace.semanticSceneModel,
    semanticSceneResponse: trace.semanticSceneResponse,
    findingTruth: freezeFindingTruth(trace.findingTruth),
    verificationTrail: Object.freeze([...trace.verificationTrail]),
    explanation: trace.explanation,
    judgeResult: trace.judgeResult,
    verificationSummary: trace.verificationSummary,
    timing: Object.freeze({
      totalMs: steps.length,
      nodeTimings: Object.freeze(nodeTimings),
    }),
    nodeExecutionOrder: trace.nodeExecutionOrder,
    steps: Object.freeze(steps),
    ...(trace.findingProbe ? { findingProbe: freezeFindingProbeTrace(trace.findingProbe) } : {}),
  });
}

export function serializeSceneAnalysisTraceDocument(document: SceneAnalysisTraceDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export type SceneAnalysisTruthDivergence = Readonly<{
  node: string;
  stepIndex: number;
  reason: string;
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
}>;

export function findFirstTruthDivergence(trace: SceneAnalysisTrace | SceneAnalysisTraceDocument): SceneAnalysisTruthDivergence | null {
  for (const [index, step] of trace.steps.entries()) {
    const verification = "verification" in step ? step.verification : null;
    const beforeTruth = "beforeView" in step ? step.beforeView.findingTruth : step.before.findingTruth;
    const afterTruth = "afterView" in step ? step.afterView.findingTruth : step.after.findingTruth;

    if (verification?.verificationResult === "reject") {
      return Object.freeze({
        node: step.node,
        stepIndex: index,
        reason: verification.reason,
        expectedTruth: verification.expectedTruth,
        actualTruth: verification.actualTruth,
      });
    }

    if (beforeTruth?.truthId !== afterTruth?.truthId) {
      return Object.freeze({
        node: step.node,
        stepIndex: index,
        reason: "finding_truth_changed",
        expectedTruth: beforeTruth,
        actualTruth: afterTruth,
      });
    }
  }

  return null;
}

