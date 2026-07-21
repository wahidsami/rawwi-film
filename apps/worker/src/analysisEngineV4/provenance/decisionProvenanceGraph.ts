import type { DecisionProvenance, DecisionProvenanceGraph, DecisionProvenanceGraphEdge, DecisionProvenanceGraphNode } from "./decisionProvenanceTypes.js";

function nodeTimestamp(sceneId: string, order: number): string {
  return `${sceneId}:${String(order).padStart(3, "0")}`;
}

function createNode(
  sceneId: string,
  id: string,
  kind: DecisionProvenanceGraphNode["kind"],
  label: string,
  parentNodeIds: readonly string[],
  confidence: number | null,
  executionOrder: number,
): DecisionProvenanceGraphNode {
  return Object.freeze({
    id,
    kind,
    label,
    parentNodeIds: Object.freeze([...parentNodeIds].sort()),
    childNodeIds: Object.freeze([]),
    confidence,
    executionOrder,
    timestamp: nodeTimestamp(sceneId, executionOrder),
  });
}

function mergeNode(
  existing: DecisionProvenanceGraphNode | null,
  next: DecisionProvenanceGraphNode,
): DecisionProvenanceGraphNode {
  if (!existing) {
    return next;
  }

  return Object.freeze({
    ...existing,
    parentNodeIds: Object.freeze([...new Set([...existing.parentNodeIds, ...next.parentNodeIds])].sort()),
    childNodeIds: existing.childNodeIds,
    confidence: existing.confidence ?? next.confidence,
    executionOrder: Math.min(existing.executionOrder, next.executionOrder),
    timestamp: existing.timestamp,
  });
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter(Boolean))].sort());
}

function addEdge(edgeMap: Map<string, DecisionProvenanceGraphEdge>, fromNodeId: string, toNodeId: string): void {
  const key = `${fromNodeId}->${toNodeId}`;
  if (!edgeMap.has(key)) {
    edgeMap.set(key, Object.freeze({
      id: key,
      fromNodeId,
      toNodeId,
      relation: "derived_from",
    }));
  }
}

export function buildDecisionProvenanceGraph(
  sceneId: string,
  provenance: readonly DecisionProvenance[],
): DecisionProvenanceGraph {
  const nodeMap = new Map<string, DecisionProvenanceGraphNode>();
  const edgeMap = new Map<string, DecisionProvenanceGraphEdge>();
  const sceneNodeId = `scene:${sceneId}`;

  nodeMap.set(sceneNodeId, createNode(sceneId, sceneNodeId, "scene", `Scene ${sceneId}`, [], null, 0));

  for (const item of provenance) {
    const evidenceIds = uniqueStrings(item.evidenceIds);
    const conceptIds = uniqueStrings(item.conceptIds);
    const legalDecisionIds = uniqueStrings(item.legalDecisionIds);
    const explanationIds = uniqueStrings(item.explanationIds);
    const findingNodeId = `verifiedFinding:${item.findingId}`;
    const evidenceNodeIds = evidenceIds.map((evidenceId) => `evidence:${evidenceId}`);
    const conceptNodeIds = conceptIds.map((conceptId) => `concept:${conceptId}`);
    const legalNodeIds = legalDecisionIds.map((legalDecisionId) => `legalDecision:${legalDecisionId}`);
    const explanationNodeIds = explanationIds.map((explanationId) => `explanation:${explanationId}`);

    for (const evidenceId of evidenceIds) {
      const nodeId = `evidence:${evidenceId}`;
      const node = createNode(sceneId, nodeId, "evidence", evidenceId, [sceneNodeId], null, 1);
      nodeMap.set(nodeId, mergeNode(nodeMap.get(nodeId) ?? null, node));
      addEdge(edgeMap, sceneNodeId, nodeId);
    }

    for (const conceptId of conceptIds) {
      const nodeId = `concept:${conceptId}`;
      const node = createNode(sceneId, nodeId, "concept", conceptId, evidenceNodeIds.length > 0 ? evidenceNodeIds : [sceneNodeId], null, 2);
      nodeMap.set(nodeId, mergeNode(nodeMap.get(nodeId) ?? null, node));
      for (const parentNodeId of evidenceNodeIds.length > 0 ? evidenceNodeIds : [sceneNodeId]) {
        addEdge(edgeMap, parentNodeId, nodeId);
      }
    }

    for (const legalDecisionId of legalDecisionIds) {
      const nodeId = `legalDecision:${legalDecisionId}`;
      const node = createNode(sceneId, nodeId, "legalDecision", legalDecisionId, conceptNodeIds.length > 0 ? conceptNodeIds : [sceneNodeId], null, 3);
      nodeMap.set(nodeId, mergeNode(nodeMap.get(nodeId) ?? null, node));
      for (const parentNodeId of conceptNodeIds.length > 0 ? conceptNodeIds : [sceneNodeId]) {
        addEdge(edgeMap, parentNodeId, nodeId);
      }
    }

    for (const explanationId of explanationIds) {
      const nodeId = `explanation:${explanationId}`;
      const node = createNode(sceneId, nodeId, "explanation", explanationId, legalNodeIds.length > 0 ? legalNodeIds : [sceneNodeId], null, 4);
      nodeMap.set(nodeId, mergeNode(nodeMap.get(nodeId) ?? null, node));
      for (const parentNodeId of legalNodeIds.length > 0 ? legalNodeIds : [sceneNodeId]) {
        addEdge(edgeMap, parentNodeId, nodeId);
      }
    }

    const findingNode = createNode(sceneId, findingNodeId, "verifiedFinding", item.findingId, explanationNodeIds.length > 0 ? explanationNodeIds : [sceneNodeId], item.confidencePath.at(-1) ?? null, 5);
    nodeMap.set(findingNodeId, mergeNode(nodeMap.get(findingNodeId) ?? null, findingNode));
    for (const parentNodeId of explanationNodeIds.length > 0 ? explanationNodeIds : [sceneNodeId]) {
      addEdge(edgeMap, parentNodeId, findingNodeId);
    }
  }

  const edges = [...edgeMap.values()].sort((left, right) => left.id.localeCompare(right.id));
  const childLists = new Map<string, string[]>();
  for (const edge of edges) {
    const bucket = childLists.get(edge.fromNodeId) ?? [];
    bucket.push(edge.toNodeId);
    childLists.set(edge.fromNodeId, bucket);
  }

  const nodes = [...nodeMap.values()]
    .map((node) => Object.freeze({
      ...node,
      childNodeIds: Object.freeze([...(childLists.get(node.id) ?? [])].sort()),
    }))
    .sort((left, right) => left.executionOrder - right.executionOrder || left.id.localeCompare(right.id));

  return Object.freeze({
    sceneId,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}
