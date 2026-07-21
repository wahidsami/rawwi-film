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
  truthId: string | null;
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
  truthId: string | null;
  preserved: boolean;
  preservationRate: number;
  reason: string;
}>;

export type TruthVerificationSummary = Readonly<{
  totalNodes: number;
  passCount: number;
  rejectCount: number;
  overallPreservationRate: number;
  firstFailureNode: string | null;
  firstFailureReason: string | null;
  metrics: readonly TruthVerificationMetric[];
}>;

export type TruthVerificationErrorDetails = Readonly<{
  nodeName: string;
  truthId: string | null;
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
  reason: string;
}>;

export class TruthVerificationError extends Error {
  readonly nodeName: string;
  readonly truthId: string | null;
  readonly expectedTruth: FindingTruth | null;
  readonly actualTruth: FindingTruth | null;
  readonly reason: string;

  constructor(details: TruthVerificationErrorDetails) {
    super(
      [
        "Truth verification failed",
        `Node: ${details.nodeName}`,
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
  input: Readonly<Record<string, unknown>>;
  output: Readonly<Record<string, unknown>>;
  expectedTruth: FindingTruth | null;
  actualTruth: FindingTruth | null;
  executionTimeMs: number;
  reason: string;
}>): FindingTruthNodeVerification {
  return Object.freeze({
    nodeName: input.nodeName,
    truthId: input.actualTruth?.truthId ?? input.expectedTruth?.truthId ?? null,
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
  const totalNodes = steps.length;
  const passCount = steps.filter((step) => step.verificationResult === "pass").length;
  const rejectCount = steps.filter((step) => step.verificationResult === "reject").length;
  const firstFailure = steps.find((step) => step.verificationResult === "reject") ?? null;
  const metrics = steps.map((step) => Object.freeze({
    nodeName: step.nodeName,
    truthId: step.truthId,
    preserved: step.verificationResult === "pass",
    preservationRate: step.verificationResult === "pass" ? 100 : 0,
    reason: step.reason,
  }));

  return Object.freeze({
    totalNodes,
    passCount,
    rejectCount,
    overallPreservationRate: totalNodes === 0 ? 100 : Number(((passCount / totalNodes) * 100).toFixed(6)),
    firstFailureNode: firstFailure?.nodeName ?? null,
    firstFailureReason: firstFailure?.reason ?? null,
    metrics: Object.freeze(metrics),
  });
}
