import { createHash } from "node:crypto";

import type { Evidence, EvidenceCollection } from "./evidence/evidenceTypes.js";

export type FindingTruth = Readonly<{
  truthId: string;
  sceneId: string;
  evidenceId: string;
  evidenceSpanId: string;
  page: number;
  scene: string;
  startOffset: number;
  endOffset: number;
  rawEvidenceText: string;
}>;

export type FindingTruthSnapshot = Readonly<{
  truthId: string | null;
  sceneId: string | null;
  evidenceId: string | null;
  evidenceSpanId: string | null;
  page: number | null;
  scene: string | null;
  startOffset: number | null;
  endOffset: number | null;
  rawEvidenceText: string | null;
}>;

export type FindingTruthNodeVerification = Readonly<{
  nodeName: string;
  nodeLabel: string;
  truthId: string | null;
  inputTruthHash: string | null;
  outputTruthHash: string | null;
  inputSummary: string;
  outputSummary: string;
  mutationDetected: boolean;
  mutations: readonly TruthVerificationMutation[];
  verificationPassed: boolean;
  truthNode: boolean;
  input: Readonly<Record<string, unknown>>;
  output: Readonly<Record<string, unknown>>;
  reason: string;
  executionTimeMs: number;
  verificationResult: "pass" | "reject";
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
}>;

export type TruthVerificationMetric = Readonly<{
  nodeName: string;
  nodeLabel: string;
  truthId: string | null;
  preserved: boolean;
  preservationRate: number;
  reason: string;
}>;

export type TruthVerificationSummary = Readonly<{
  totalNodes: number;
  totalFindings: number;
  passCount: number;
  verified: number;
  rejectCount: number;
  failed: number;
  overallPreservationRate: number;
  truthChainIntact: boolean;
  truthChainState: "Truth Chain Intact" | "Truth Divergence Detected";
  firstFailureNode: string | null;
  firstDivergenceNode: string | null;
  firstDivergenceField: string | null;
  firstFailureReason: string | null;
  firstDivergenceReason: string | null;
  metrics: readonly TruthVerificationMetric[];
}>;

export type TruthVerificationMutation = Readonly<{
  field: string;
  oldValue: unknown;
  newValue: unknown;
}>;

export type TruthVerificationErrorDetails = Readonly<{
  nodeName: string;
  nodeLabel: string;
  truthId: string | null;
  inputTruthHash: string | null;
  outputTruthHash: string | null;
  inputSummary: string;
  outputSummary: string;
  mutationDetected: boolean;
  mutations: readonly TruthVerificationMutation[];
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
  reason: string;
}>;

export class TruthVerificationError extends Error {
  readonly nodeName: string;
  readonly nodeLabel!: string;
  readonly truthId!: string | null;
  readonly inputTruthHash!: string | null;
  readonly outputTruthHash!: string | null;
  readonly inputSummary!: string;
  readonly outputSummary!: string;
  readonly mutationDetected!: boolean;
  readonly mutations!: readonly TruthVerificationMutation[];
  readonly expectedTruth: FindingTruth | null;
  readonly actualTruth: FindingTruth | null;
  readonly reason: string;

  constructor(details: TruthVerificationErrorDetails) {
    super(
      [
        "Truth verification failed",
        `Node: ${details.nodeLabel} (${details.nodeName})`,
        `Input Truth Hash: ${details.inputTruthHash ?? "null"}`,
        `Output Truth Hash: ${details.outputTruthHash ?? "null"}`,
        `Input Summary: ${details.inputSummary}`,
        `Output Summary: ${details.outputSummary}`,
        `Mutation Detected: ${details.mutationDetected ? "Yes" : "No"}`,
        ...details.mutations.map((mutation) => `Field: ${mutation.field} | Old Value: ${formatValue(mutation.oldValue)} | New Value: ${formatValue(mutation.newValue)}`),
        `Expected: ${formatTruth(details.expectedTruth)}`,
        `Actual: ${formatTruth(details.actualTruth)}`,
        `Reason: ${details.reason}`,
      ].join("\n"),
    );
    this.name = "TruthVerificationError";
    this.nodeName = details.nodeName;
    this.truthId = details.truthId;
    this.expectedTruth = details.expectedTruth;
    this.actualTruth = details.actualTruth;
    this.reason = details.reason;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function sha256(value: string): string {
  const hash = createHash("sha256");
  hash.update(value);
  return hash.digest("hex");
}

function formatTruth(truth: FindingTruth | null): string {
  return truth ? JSON.stringify(truth) : "null";
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return JSON.stringify(value);
}

function summarizeTruth(truth: FindingTruth | null): string {
  if (!truth) {
    return "truth=null";
  }

  return [
    `truthId=${truth.truthId}`,
    `sceneId=${truth.sceneId}`,
    `evidenceId=${truth.evidenceId}`,
    `spanId=${truth.evidenceSpanId}`,
    `page=${truth.page}`,
    `offsets=${truth.startOffset}-${truth.endOffset}`,
    `scene=${normalizeText(truth.scene).slice(0, 120)}`,
    `evidence=${normalizeText(truth.rawEvidenceText).slice(0, 120)}`,
  ].join("; ");
}

function humanizeNodeName(nodeName: string): string {
  return nodeName
    .split(/[_\s-]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function diffTruth(left: FindingTruth | null, right: FindingTruth | null): readonly TruthVerificationMutation[] {
  const fields: readonly (keyof FindingTruth)[] = [
    "truthId",
    "sceneId",
    "evidenceId",
    "evidenceSpanId",
    "page",
    "scene",
    "startOffset",
    "endOffset",
    "rawEvidenceText",
  ];
  const mutations: TruthVerificationMutation[] = [];

  for (const field of fields) {
    const oldValue = left ? left[field] : null;
    const newValue = right ? right[field] : null;
    if (oldValue !== newValue) {
      mutations.push(Object.freeze({
        field,
        oldValue,
        newValue,
      }));
    }
  }

  return Object.freeze(mutations);
}

export function compareFindingTruth(left: FindingTruth | null, right: FindingTruth | null): readonly TruthVerificationMutation[] {
  return diffTruth(left, right);
}

export function buildFindingTruth(sceneId: string, evidenceCollection: EvidenceCollection | null): FindingTruth | null {
  if (!evidenceCollection || evidenceCollection.evidence.length === 0) {
    return null;
  }

  const primaryEvidenceId = evidenceCollection.primaryEvidenceId ?? evidenceCollection.evidence[0]?.id ?? null;
  const evidence = evidenceCollection.evidence.find((entry) => entry.id === primaryEvidenceId || entry.spanId === primaryEvidenceId) ?? evidenceCollection.evidence[0] ?? null;
  if (!evidence) {
    return null;
  }

  return buildFindingTruthFromEvidence(sceneId, evidence);
}

export function buildFindingTruthFromEvidence(sceneId: string, evidence: Evidence): FindingTruth {
  const evidenceId = evidence.id ?? evidence.spanId;
  const evidenceSpanId = evidence.spanId ?? evidence.id;
  const page = evidence.page ?? evidence.pageReferences[0]?.pageNumber ?? 1;
  const scene = normalizeText(evidence.scene ?? evidence.text ?? evidence.rawText ?? "");
  const startOffset = evidence.startOffset ?? evidence.byteStartOffset ?? 0;
  const endOffset = evidence.endOffset ?? evidence.byteEndOffset ?? startOffset;
  const rawEvidenceText = evidence.rawText ?? evidence.text ?? "";
  const truthId = sha256(JSON.stringify({
    sceneId,
    evidenceId,
    evidenceSpanId,
    page,
    scene,
    startOffset,
    endOffset,
    rawEvidenceText,
  }));

  return Object.freeze({
    truthId,
    sceneId,
    evidenceId,
    evidenceSpanId,
    page,
    scene,
    startOffset,
    endOffset,
    rawEvidenceText,
  });
}

export function createFindingTruthSnapshot(truth: FindingTruth | null): FindingTruthSnapshot {
  return Object.freeze(truth ? {
    truthId: truth.truthId,
    sceneId: truth.sceneId,
    evidenceId: truth.evidenceId,
    evidenceSpanId: truth.evidenceSpanId,
    page: truth.page,
    scene: truth.scene,
    startOffset: truth.startOffset,
    endOffset: truth.endOffset,
    rawEvidenceText: truth.rawEvidenceText,
  } : {
    truthId: null,
    sceneId: null,
    evidenceId: null,
    evidenceSpanId: null,
    page: null,
    scene: null,
    startOffset: null,
    endOffset: null,
    rawEvidenceText: null,
  });
}

export function isSameFindingTruth(left: FindingTruth | null, right: FindingTruth | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.truthId === right.truthId
    && left.sceneId === right.sceneId
    && left.evidenceId === right.evidenceId
    && left.evidenceSpanId === right.evidenceSpanId
    && left.page === right.page
    && left.scene === right.scene
    && left.startOffset === right.startOffset
    && left.endOffset === right.endOffset
    && left.rawEvidenceText === right.rawEvidenceText;
}

export function createTruthVerificationError(details: TruthVerificationErrorDetails): TruthVerificationError {
  return new TruthVerificationError(details);
}

export function createNodeTruthVerification(input: Readonly<{
  nodeName: string;
  nodeLabel?: string;
  input: Readonly<Record<string, unknown>>;
  output: Readonly<Record<string, unknown>>;
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
  executionTimeMs: number;
  reason: string;
  truthNode?: boolean;
  inputSummary?: string;
  outputSummary?: string;
  mutations?: readonly TruthVerificationMutation[];
}>): FindingTruthNodeVerification {
  const nodeLabel = input.nodeLabel ?? humanizeNodeName(input.nodeName);
  const mutations = Object.freeze([...(input.mutations ?? diffTruth(input.expectedTruth, input.actualTruth))]);
  return Object.freeze({
    nodeName: input.nodeName,
    nodeLabel,
    truthId: input.actualTruth?.truthId ?? input.expectedTruth?.truthId ?? null,
    inputTruthHash: input.expectedTruth?.truthId ?? null,
    outputTruthHash: input.actualTruth?.truthId ?? null,
    inputSummary: input.inputSummary ?? summarizeTruth(input.expectedTruth),
    outputSummary: input.outputSummary ?? summarizeTruth(input.actualTruth),
    mutationDetected: mutations.length > 0,
    mutations,
    verificationPassed: input.reason !== "finding_truth_removed" && input.reason !== "finding_truth_changed",
    truthNode: input.truthNode ?? true,
    input: Object.freeze({ ...input.input }),
    output: Object.freeze({ ...input.output }),
    reason: input.reason,
    executionTimeMs: input.executionTimeMs,
    verificationResult: "pass",
    expectedTruth: input.expectedTruth,
    actualTruth: input.actualTruth,
  });
}

export function createTruthVerificationSummary(steps: readonly FindingTruthNodeVerification[]): TruthVerificationSummary {
  const truthSteps = steps.filter((step) => step.truthNode !== false);
  const totalNodes = steps.length;
  const totalFindings = truthSteps.length;
  const passCount = truthSteps.filter((step) => step.verificationResult === "pass").length;
  const rejectCount = truthSteps.filter((step) => step.verificationResult === "reject").length;
  const firstFailure = truthSteps.find((step) => step.verificationResult === "reject") ?? null;
  const metrics = steps.map((step) => Object.freeze({
    nodeName: step.nodeName,
    nodeLabel: step.nodeLabel,
    truthId: step.truthId,
    preserved: step.verificationResult === "pass",
    preservationRate: step.verificationResult === "pass" ? 100 : 0,
    reason: step.reason,
  }));

  return Object.freeze({
    totalNodes,
    totalFindings,
    passCount,
    verified: passCount,
    rejectCount,
    failed: rejectCount,
    overallPreservationRate: totalFindings === 0 ? 100 : Number(((passCount / totalFindings) * 100).toFixed(6)),
    truthChainIntact: rejectCount === 0,
    truthChainState: rejectCount === 0 ? "Truth Chain Intact" : "Truth Divergence Detected",
    firstFailureNode: firstFailure?.nodeName ?? null,
    firstDivergenceNode: firstFailure?.nodeLabel ?? firstFailure?.nodeName ?? null,
    firstDivergenceField: firstFailure?.mutations[0]?.field ?? null,
    firstFailureReason: firstFailure?.reason ?? null,
    firstDivergenceReason: firstFailure?.reason ?? null,
    metrics: Object.freeze(metrics),
  });
}
