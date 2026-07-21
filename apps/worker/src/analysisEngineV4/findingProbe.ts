import { createHash } from "node:crypto";

import type { SceneAnalysisTraceEntry, SceneAnalysisTraceNodeView } from "./sceneAnalysisState.js";
import type { QualityJudgeStatus } from "./judge/qualityJudgeTypes.js";
import type { FindingTruth } from "./truthVerification.js";

export type FindingProbeSelection = Readonly<{
  requestedTruthId: string | null;
  requestedFindingText: string | null;
  matchedBy: "truth_id" | "finding_text" | null;
  selectedTruthId: string | null;
  selectedEvidenceId: string | null;
  selectedEvidenceText: string | null;
  selectedStepIndex: number;
}>;

export type FindingProbeMutation = Readonly<{
  field: string;
  previousValue: string | number | boolean | null;
  newValue: string | number | boolean | null;
  nodeResponsible: string;
}>;

export type FindingProbeStep = Readonly<{
  nodeName: string;
  truthId: string | null;
  evidenceId: string | null;
  evidenceText: string | null;
  evidenceStartOffset: number | null;
  evidenceEndOffset: number | null;
  concept: string | null;
  article: string | null;
  explanation: string | null;
  explanationPromptHash: string | null;
  explanationResponse: string | null;
  judgeDecision: QualityJudgeStatus | null;
  objectHash: string;
  mutationFlag: boolean;
  mutation: FindingProbeMutation | null;
  executionTimeMs: number;
}>;

export type FindingProbeTrace = Readonly<{
  selection: FindingProbeSelection;
  stoppedAtNode: string | null;
  stopReason: string | null;
  steps: readonly FindingProbeStep[];
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function hashValue(value: string): string {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft);
}

function readSelectionConfig(): Readonly<{
  truthId: string | null;
  findingText: string | null;
}> {
  const truthId = process.env.DEBUG_TRUTH_ID?.trim() ?? "";
  const findingText = process.env.DEBUG_FINDING_TEXT?.trim() ?? "";
  return Object.freeze({
    truthId: truthId.length > 0 ? truthId : null,
    findingText: findingText.length > 0 ? findingText : null,
  });
}

function firstEvidence(view: SceneAnalysisTraceNodeView, selectedTruth: FindingTruth | null): typeof view.evidence[0] | null {
  const byTruth = selectedTruth
    ? view.evidenceCollection?.evidence.find((entry) => entry.id === selectedTruth.evidenceId || entry.spanId === selectedTruth.evidenceSpanId) ?? null
    : null;
  return byTruth ?? view.evidenceCollection?.evidence[0] ?? view.evidence[0] ?? null;
}

function firstConcept(view: SceneAnalysisTraceNodeView, evidenceId: string | null): typeof view.concepts[0] | null {
  if (evidenceId) {
    const matched = view.conceptCollection?.concepts.find((concept) => concept.evidenceSpanIds.includes(evidenceId)) ?? null;
    if (matched) {
      return matched;
    }
  }

  return view.conceptCollection?.concepts[0] ?? view.concepts[0] ?? null;
}

function firstArticle(view: SceneAnalysisTraceNodeView): SceneAnalysisTraceNodeView["selectedArticle"] {
  return view.legalDecisionCollection?.primaryArticle ?? view.selectedArticle ?? view.rankedArticles[0] ?? null;
}

function firstExplanation(view: SceneAnalysisTraceNodeView, evidenceId: string | null, conceptId: string | null, articleId: number | null): SceneAnalysisTraceNodeView["explanation"] {
  const fromCollection = view.explanationCollection?.primaryExplanation ?? null;
  if (fromCollection) {
    return view.explanation ?? {
      summary: fromCollection.summary,
      groundedEvidence: view.evidenceCollection?.evidence.find((entry) => entry.id === fromCollection.evidenceId || entry.spanId === fromCollection.evidenceId)?.text ?? fromCollection.summary,
      primaryArticleId: articleId,
      primaryArticleTitleAr: articleId !== null ? view.selectedArticle?.titleAr ?? null : null,
      primaryAtomId: null,
      primaryAtomTitleAr: null,
      rationale: fromCollection.reasoning,
    };
  }

  return view.explanation ?? null;
}

function explanationReferencesEvidence(summary: string | null, response: string | null, evidenceText: string | null): boolean {
  if (!summary || !evidenceText) {
    return true;
  }

  const normalizedEvidence = normalizeText(evidenceText);
  const normalizedSummary = normalizeText(summary ?? "");
  const normalizedResponse = normalizeText(response ?? "");
  return normalizedSummary.includes(normalizedEvidence)
    || normalizedResponse.includes(normalizedEvidence);
}

function computeObjectHash(step: Omit<FindingProbeStep, "objectHash" | "mutationFlag" | "mutation" | "executionTimeMs">, executionTimeMs: number): string {
  return hashValue(JSON.stringify({
    ...step,
    executionTimeMs,
  }));
}

function toComparableValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function compareSteps(previous: FindingProbeStep | null, current: Omit<FindingProbeStep, "objectHash" | "mutationFlag" | "mutation">): FindingProbeMutation | null {
  if (!previous) {
    return null;
  }

  const stableFields: readonly (keyof Pick<FindingProbeStep, "truthId" | "evidenceId" | "evidenceText" | "evidenceStartOffset" | "evidenceEndOffset">)[] = [
    "truthId",
    "evidenceId",
    "evidenceText",
    "evidenceStartOffset",
    "evidenceEndOffset",
  ];

  for (const field of stableFields) {
    const previousValue = toComparableValue(previous[field]);
    const currentValue = toComparableValue(current[field]);
    if (previousValue !== currentValue) {
      return Object.freeze({
        field,
        previousValue,
        newValue: currentValue,
        nodeResponsible: current.nodeName,
      });
    }
  }

  const explanationChanged = previous.explanation !== current.explanation;
  const evidenceText = current.evidenceText;
  if (explanationChanged && !explanationReferencesEvidence(current.explanation, current.explanationResponse, evidenceText)) {
    return Object.freeze({
      field: "explanation",
      previousValue: toComparableValue(previous.explanation),
      newValue: toComparableValue(current.explanation),
      nodeResponsible: current.nodeName,
    });
  }

  return null;
}

function buildStep(entry: SceneAnalysisTraceEntry, selectedTruth: FindingTruth | null): Omit<FindingProbeStep, "objectHash" | "mutationFlag" | "mutation"> {
  const view = entry.afterView;
  const evidence = firstEvidence(view, selectedTruth);
  const concept = firstConcept(view, evidence?.id ?? evidence?.spanId ?? selectedTruth?.evidenceId ?? null);
  const article = firstArticle(view);
  const explanation = firstExplanation(view, evidence?.id ?? evidence?.spanId ?? selectedTruth?.evidenceId ?? null, concept?.conceptId ?? null, article?.articleId ?? null);
  const judgeDecision = view.judgeResult?.status ?? view.verifiedFindingCollection?.report.overallStatus ?? null;
  const explanationPromptHash = view.explanationCollection?.prompt ? hashValue(view.explanationCollection.prompt) : null;
  const explanationResponse = view.explanationCollection?.response ?? null;

  return Object.freeze({
    nodeName: entry.node,
    truthId: view.findingTruth?.truthId ?? selectedTruth?.truthId ?? null,
    evidenceId: evidence?.id ?? evidence?.spanId ?? selectedTruth?.evidenceId ?? null,
    evidenceText: evidence?.text ?? evidence?.rawText ?? selectedTruth?.rawEvidenceText ?? null,
    evidenceStartOffset: evidence?.startOffset ?? evidence?.byteStartOffset ?? selectedTruth?.startOffset ?? null,
    evidenceEndOffset: evidence?.endOffset ?? evidence?.byteEndOffset ?? selectedTruth?.endOffset ?? null,
    concept: concept ? `${concept.conceptId}:${concept.label}` : null,
    article: article ? `${article.articleId}:${article.titleAr}` : null,
    explanation: explanation?.summary ?? null,
    explanationPromptHash,
    explanationResponse,
    judgeDecision,
    executionTimeMs: entry.durationMs,
  });
}

export function buildFindingProbeTrace(trace: Readonly<{
  steps: readonly SceneAnalysisTraceEntry[];
  findingTruth: FindingTruth | null;
}>): FindingProbeTrace | null {
  const selectionConfig = readSelectionConfig();
  if (!selectionConfig.truthId && !selectionConfig.findingText) {
    return null;
  }

  let selectedStepIndex = -1;
  let selectedTruth: FindingTruth | null = null;
  let selectedEvidenceText: string | null = null;
  let matchedBy: FindingProbeSelection["matchedBy"] = null;

  for (const [index, entry] of trace.steps.entries()) {
    const truth = entry.afterView.findingTruth ?? trace.findingTruth;
    const evidence = firstEvidence(entry.afterView, truth);
    const candidateText = evidence?.text ?? evidence?.rawText ?? truth?.rawEvidenceText ?? null;

    if (selectionConfig.truthId && truth?.truthId === selectionConfig.truthId) {
      selectedStepIndex = index;
      selectedTruth = truth;
      selectedEvidenceText = candidateText;
      matchedBy = "truth_id";
      break;
    }

    if (selectionConfig.findingText && candidateText && sameText(candidateText, selectionConfig.findingText)) {
      selectedStepIndex = index;
      selectedTruth = truth;
      selectedEvidenceText = candidateText;
      matchedBy = "finding_text";
      break;
    }
  }

  if (selectedStepIndex < 0) {
    return null;
  }

  const steps: FindingProbeStep[] = [];
  let previousStep: FindingProbeStep | null = null;
  let stoppedAtNode: string | null = null;
  let stopReason: string | null = null;

  for (const entry of trace.steps.slice(selectedStepIndex)) {
    const current = buildStep(entry, selectedTruth);
    const mutation = compareSteps(previousStep, current);
    const finalizedStep = Object.freeze({
      ...current,
      objectHash: computeObjectHash(current, current.executionTimeMs),
      mutationFlag: mutation !== null,
      mutation,
    });
    steps.push(finalizedStep);

    if (mutation) {
      stoppedAtNode = finalizedStep.nodeName;
      stopReason = `FIELD MUTATED: ${mutation.field}`;
      break;
    }

    previousStep = finalizedStep;
  }

  return Object.freeze({
    selection: Object.freeze({
      requestedTruthId: selectionConfig.truthId,
      requestedFindingText: selectionConfig.findingText,
      matchedBy,
      selectedTruthId: selectedTruth?.truthId ?? null,
      selectedEvidenceId: selectedTruth?.evidenceId ?? null,
      selectedEvidenceText,
      selectedStepIndex,
    }),
    stoppedAtNode,
    stopReason,
    steps: Object.freeze(steps),
  });
}
