import type { DecisionProvenanceCollection, DecisionProvenanceGraph, DecisionProvenanceGraphEdge, DecisionProvenanceGraphNode, DecisionProvenanceReport } from "./decisionProvenanceTypes.js";

function freezeGraphNode(node: DecisionProvenanceGraphNode): DecisionProvenanceGraphNode {
  return Object.freeze({
    ...node,
    parentNodeIds: Object.freeze([...node.parentNodeIds]),
    childNodeIds: Object.freeze([...node.childNodeIds]),
  });
}

function freezeGraphEdge(edge: DecisionProvenanceGraphEdge): DecisionProvenanceGraphEdge {
  return Object.freeze({ ...edge });
}

function freezeGraph(graph: DecisionProvenanceGraph): DecisionProvenanceGraph {
  return Object.freeze({
    ...graph,
    nodes: Object.freeze(graph.nodes.map(freezeGraphNode)),
    edges: Object.freeze(graph.edges.map(freezeGraphEdge)),
  });
}

function freezeReport(report: DecisionProvenanceReport): DecisionProvenanceReport {
  return Object.freeze({
    ...report,
    replayableFindingIds: Object.freeze([...report.replayableFindingIds]),
    replayableChains: Object.freeze(report.replayableChains.map((chain) => Object.freeze({
      ...chain,
      path: Object.freeze([...chain.path]),
    }))),
  });
}

export function normalizeDecisionProvenanceCollectionForDocument(collection: DecisionProvenanceCollection | null): DecisionProvenanceCollection | null {
  if (!collection) {
    return null;
  }

  return Object.freeze({
    ...collection,
    executionTimeMs: 0,
    provenance: Object.freeze(collection.provenance.map((item) => Object.freeze({
      ...item,
      evidenceIds: Object.freeze([...item.evidenceIds]),
      conceptIds: Object.freeze([...item.conceptIds]),
      legalDecisionIds: Object.freeze([...item.legalDecisionIds]),
      explanationIds: Object.freeze([...item.explanationIds]),
      parentNodeIds: Object.freeze([...item.parentNodeIds]),
      childNodeIds: Object.freeze([...item.childNodeIds]),
      executionOrder: Object.freeze([...item.executionOrder]),
      confidencePath: Object.freeze([...item.confidencePath]),
      timestamps: Object.freeze([...item.timestamps]),
    }))),
    graph: freezeGraph(collection.graph),
    report: freezeReport(collection.report),
  });
}

export function serializeDecisionProvenanceCollection(collection: DecisionProvenanceCollection): string {
  return `${JSON.stringify(normalizeDecisionProvenanceCollectionForDocument(collection), null, 2)}\n`;
}
