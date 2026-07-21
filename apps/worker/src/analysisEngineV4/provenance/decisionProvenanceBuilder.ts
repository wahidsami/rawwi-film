import type { ConceptCollection, ConceptRecord } from "../concepts/conceptTypes.js";
import type { EvidenceCollection, Evidence } from "../evidence/evidenceTypes.js";
import type { ExplanationCollection, ExplanationRecord } from "../explanations/explanationTypes.js";
import type { LegalDecision, LegalDecisionCollection } from "../legal/legalDecision.js";
import type { VerifiedFinding, VerifiedFindingCollection } from "../judge/qualityJudgeTypes.js";
import { buildDecisionProvenanceGraph } from "./decisionProvenanceGraph.js";
import type {
  DecisionProvenance,
  DecisionProvenanceCollection,
  DecisionProvenanceInput,
  DecisionProvenanceReport,
  DecisionProvenanceGraph,
} from "./decisionProvenanceTypes.js";

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))].sort());
}

function findEvidence(collection: EvidenceCollection | null, evidenceId: string): Evidence | null {
  return collection?.evidence.find((entry) => entry.id === evidenceId || entry.spanId === evidenceId) ?? null;
}

function findConcept(collection: ConceptCollection | null, conceptId: string): ConceptRecord | null {
  return collection?.concepts.find((entry) => entry.conceptId === conceptId) ?? null;
}

function findDecision(collection: LegalDecisionCollection | null, decisionId: string): LegalDecision | null {
  return collection?.decisions.find((entry) => entry.id === decisionId) ?? null;
}

function findExplanation(collection: ExplanationCollection | null, explanationId: string): ExplanationRecord | null {
  return collection?.explanations.find((entry) => entry.id === explanationId) ?? null;
}

function buildConfidencePath(
  evidenceCollection: EvidenceCollection | null,
  conceptCollection: ConceptCollection | null,
  legalDecisionCollection: LegalDecisionCollection | null,
  explanationCollection: ExplanationCollection | null,
  finding: VerifiedFinding,
): readonly number[] {
  const evidence = findEvidence(evidenceCollection, finding.evidenceId);
  const concept = findConcept(conceptCollection, finding.conceptId);
  const decision = findDecision(legalDecisionCollection, finding.legalDecisionId);
  const explanation = findExplanation(explanationCollection, finding.explanationId);

  return Object.freeze([
    evidence?.confidence ?? 0,
    concept?.confidence ?? 0,
    decision?.mappingConfidence ?? 0,
    explanation?.confidence ?? 0,
    finding.overallConfidence,
  ]);
}

function buildTimestamps(sceneId: string, executionOrder: readonly string[]): readonly string[] {
  return Object.freeze(executionOrder.map((nodeId, index) => `${sceneId}:${String(index).padStart(3, "0")}:${nodeId}`));
}

function buildProvenanceForFinding(
  sceneId: string,
  evidenceCollection: EvidenceCollection | null,
  conceptCollection: ConceptCollection | null,
  legalDecisionCollection: LegalDecisionCollection | null,
  explanationCollection: ExplanationCollection | null,
  finding: VerifiedFinding,
): DecisionProvenance {
  const concept = findConcept(conceptCollection, finding.conceptId);
  const decision = findDecision(legalDecisionCollection, finding.legalDecisionId);
  const explanation = findExplanation(explanationCollection, finding.explanationId);
  const evidenceIds = uniqueStrings([
    finding.evidenceId,
    ...(concept?.evidenceSpanIds ?? []),
    ...(decision?.candidateArticles.flatMap((article) => article.evidenceSpanIds) ?? []),
    explanation?.evidenceId ?? "",
  ]);
  const conceptIds = uniqueStrings([finding.conceptId]);
  const legalDecisionIds = uniqueStrings([finding.legalDecisionId]);
  const explanationIds = uniqueStrings([finding.explanationId]);
  const executionOrder = Object.freeze([
    `scene:${sceneId}`,
    ...evidenceIds.map((evidenceId) => `evidence:${evidenceId}`),
    ...conceptIds.map((conceptId) => `concept:${conceptId}`),
    ...legalDecisionIds.map((legalDecisionId) => `legalDecision:${legalDecisionId}`),
    ...explanationIds.map((explanationId) => `explanation:${explanationId}`),
    `verifiedFinding:${finding.findingId}`,
  ]);

  return Object.freeze({
    findingId: finding.findingId,
    sceneId,
    evidenceIds,
    conceptIds,
    legalDecisionIds,
    explanationIds,
    parentNodeIds: Object.freeze([
      ...evidenceIds.map((evidenceId) => `evidence:${evidenceId}`),
      ...conceptIds.map((conceptId) => `concept:${conceptId}`),
      ...legalDecisionIds.map((legalDecisionId) => `legalDecision:${legalDecisionId}`),
      ...explanationIds.map((explanationId) => `explanation:${explanationId}`),
    ]),
    childNodeIds: Object.freeze([]),
    executionOrder,
    confidencePath: buildConfidencePath(evidenceCollection, conceptCollection, legalDecisionCollection, explanationCollection, finding),
    timestamps: buildTimestamps(sceneId, executionOrder),
    graphNodeIds: Object.freeze(executionOrder),
  });
}

export function buildDecisionProvenanceReportAdapter(input: Readonly<{
  sceneId: string;
  provenance: readonly DecisionProvenance[];
  graph: DecisionProvenanceGraph;
}>): DecisionProvenanceReport {
  const replayableFindingIds = uniqueStrings(input.provenance.map((item) => item.findingId));
  const graphNodeIds = new Set(input.graph.nodes.map((node) => node.id));
  const graphEdgeIds = new Set(input.graph.edges.map((edge) => edge.id));
  const brokenLinkCount = input.provenance.flatMap((item) => item.parentNodeIds).filter((nodeId) => !graphNodeIds.has(nodeId)).length;
  const brokenChainCount = input.provenance.filter((item) => item.executionOrder.some((nodeId) => !graphNodeIds.has(nodeId) && !nodeId.startsWith("scene:"))).length;

  return Object.freeze({
    sceneId: input.sceneId,
    totalFindings: input.provenance.length,
    replayableFindingIds,
    brokenLinkCount,
    brokenChainCount,
    graphNodeCount: graphNodeIds.size,
    graphEdgeCount: graphEdgeIds.size,
    replayableChains: Object.freeze(input.provenance.map((item) => Object.freeze({
      findingId: item.findingId,
      path: item.executionOrder,
    }))),
  });
}

export function buildDecisionProvenanceCollection(input: DecisionProvenanceInput): DecisionProvenanceCollection {
  const startedAt = Date.now();
  const verifiedFindings = input.verifiedFindingCollection?.verifiedFindings ?? [];
  const provenance = Object.freeze(verifiedFindings.map((finding: VerifiedFinding) => buildProvenanceForFinding(
    input.sceneId,
    input.evidenceCollection,
    input.conceptCollection,
    input.legalDecisionCollection,
    input.explanationCollection,
    finding,
  )));
  const graph = buildDecisionProvenanceGraph(input.sceneId, provenance);
  const report = buildDecisionProvenanceReportAdapter({ sceneId: input.sceneId, provenance, graph });

  return Object.freeze({
    sceneId: input.sceneId,
    provenance,
    graph,
    report,
    executionTimeMs: Math.max(0, Date.now() - startedAt),
  });
}
