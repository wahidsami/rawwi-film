import type { EvidenceCollection } from "../evidence/evidenceTypes.js";
import type { ConceptCollection } from "../concepts/conceptTypes.js";
import type { LegalDecisionCollection } from "../legal/legalDecision.js";
import type { ExplanationCollection } from "../explanations/explanationTypes.js";
import type { VerifiedFindingCollection } from "../judge/qualityJudgeTypes.js";

export type DecisionProvenanceNodeKind =
  | "scene"
  | "evidence"
  | "concept"
  | "legalDecision"
  | "explanation"
  | "verifiedFinding";

export type DecisionProvenanceGraphNode = Readonly<{
  id: string;
  kind: DecisionProvenanceNodeKind;
  label: string;
  parentNodeIds: readonly string[];
  childNodeIds: readonly string[];
  confidence: number | null;
  executionOrder: number;
  timestamp: string;
}>;

export type DecisionProvenanceGraphEdge = Readonly<{
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: "derived_from" | "parent_of";
}>;

export type DecisionProvenanceGraph = Readonly<{
  sceneId: string;
  nodes: readonly DecisionProvenanceGraphNode[];
  edges: readonly DecisionProvenanceGraphEdge[];
}>;

export type DecisionProvenance = Readonly<{
  findingId: string;
  sceneId: string;
  evidenceIds: readonly string[];
  conceptIds: readonly string[];
  legalDecisionIds: readonly string[];
  explanationIds: readonly string[];
  parentNodeIds: readonly string[];
  childNodeIds: readonly string[];
  executionOrder: readonly string[];
  confidencePath: readonly number[];
  timestamps: readonly string[];
  graphNodeIds: readonly string[];
}>;

export type DecisionProvenanceReport = Readonly<{
  sceneId: string;
  totalFindings: number;
  replayableFindingIds: readonly string[];
  brokenLinkCount: number;
  brokenChainCount: number;
  graphNodeCount: number;
  graphEdgeCount: number;
  replayableChains: readonly Readonly<{
    findingId: string;
    path: readonly string[];
  }>[];
}>;

export type DecisionProvenanceCollection = Readonly<{
  sceneId: string;
  provenance: readonly DecisionProvenance[];
  graph: DecisionProvenanceGraph;
  report: DecisionProvenanceReport;
  executionTimeMs: number;
}>;

export type DecisionProvenanceInput = Readonly<{
  sceneId: string;
  evidenceCollection: EvidenceCollection | null;
  conceptCollection: ConceptCollection | null;
  legalDecisionCollection: LegalDecisionCollection | null;
  explanationCollection: ExplanationCollection | null;
  verifiedFindingCollection: VerifiedFindingCollection | null;
}>;
