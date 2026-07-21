import type { SceneAnalysisState } from "./sceneAnalysisState.js";
import { appendSceneAnalysisTrace, createTraceTransition } from "./sceneAnalysisTrace.js";
import { freezeSceneAnalysisState, snapshotSceneAnalysisState } from "./sceneAnalysisState.js";
import { buildFindingTruth, compareFindingTruth, createNodeTruthVerification, createTruthVerificationError, isSameFindingTruth } from "./truthVerification.js";

function labelForNode(nodeName: string): string {
  switch (nodeName) {
    case "understand_scene":
      return "Scene Understanding";
    case "interpret_scene":
      return "Interpret Scene";
    case "candidate_evidence":
      return "Candidate Evidence";
    case "concept_classification":
      return "Concept Classification";
    case "legal_mapping":
      return "Legal Mapping";
    case "explanation":
      return "Explanation";
    case "quality_judge":
      return "Judge";
    case "finalize":
      return "Finalize";
    default:
      return nodeName;
  }
}

export type SceneAnalysisNode = (state: SceneAnalysisState) => SceneAnalysisState | Promise<SceneAnalysisState>;

type GraphNode = Readonly<{
  name: string;
  execute: SceneAnalysisNode;
}>;

function uniqueOrdered(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

export class StateGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Map<string, string[]>();
  private entryPoint: string | null = null;

  addNode(name: string, execute: SceneAnalysisNode): this {
    if (this.nodes.has(name)) {
      throw new Error(`SceneAnalysis state graph already has a node named "${name}"`);
    }
    this.nodes.set(name, Object.freeze({ name, execute }));
    return this;
  }

  addEdge(from: string, to: string): this {
    if (!this.nodes.has(from)) {
      throw new Error(`SceneAnalysis state graph cannot add edge from missing node "${from}"`);
    }
    if (!this.nodes.has(to)) {
      throw new Error(`SceneAnalysis state graph cannot add edge to missing node "${to}"`);
    }
    const next = this.edges.get(from) ?? [];
    next.push(to);
    this.edges.set(from, next);
    return this;
  }

  setEntryPoint(name: string): this {
    if (!this.nodes.has(name)) {
      throw new Error(`SceneAnalysis state graph entry point "${name}" is not registered`);
    }
    this.entryPoint = name;
    return this;
  }

  compile(): CompiledStateGraph {
    if (this.entryPoint === null) {
      throw new Error("SceneAnalysis state graph entry point has not been configured");
    }

    const orderedNodes = this.resolveExecutionOrder();
    return new CompiledStateGraph(orderedNodes);
  }

  private resolveExecutionOrder(): readonly GraphNode[] {
    const visited = new Set<string>();
    const ordered: GraphNode[] = [];

    const walk = (nodeName: string): void => {
      if (visited.has(nodeName)) {
        return;
      }
      visited.add(nodeName);
      const node = this.nodes.get(nodeName);
      if (!node) {
        throw new Error(`SceneAnalysis state graph references unknown node "${nodeName}"`);
      }
      ordered.push(node);
      const next = uniqueOrdered(this.edges.get(nodeName) ?? []);
      for (const child of next) {
        walk(child);
      }
    };

    walk(this.entryPoint as string);
    return Object.freeze(ordered);
  }
}

export class CompiledStateGraph {
  constructor(private readonly orderedNodes: readonly GraphNode[]) {}

  async invoke(initialState: SceneAnalysisState): Promise<SceneAnalysisState> {
    let current = freezeSceneAnalysisState(initialState);

    for (const node of this.orderedNodes) {
      const beforeSnapshot = snapshotSceneAnalysisState(current);
      const beforeTruth = current.findingTruth ?? null;
      const startedAt = new Date().toISOString();
      const startedAtMs = globalThis.performance?.now?.() ?? Date.now();

      const nodeResult = await node.execute(current);
      let normalizedResult = freezeSceneAnalysisState({
        ...nodeResult,
        trace: current.trace,
      });
      let afterTruth = normalizedResult.findingTruth ?? null;

      if (!beforeTruth && !afterTruth) {
        const derivedTruth = buildFindingTruth(current.sceneId, normalizedResult.evidenceCollection);
        if (derivedTruth) {
          afterTruth = derivedTruth;
          normalizedResult = freezeSceneAnalysisState({
            ...normalizedResult,
            findingTruth: derivedTruth,
          });
        }
      }

      afterTruth = normalizedResult.findingTruth ?? afterTruth;
      if (beforeTruth && !afterTruth) {
        const mutations = compareFindingTruth(beforeTruth, afterTruth);
        throw createTruthVerificationError({
          nodeName: node.name,
          nodeLabel: labelForNode(node.name),
          truthId: beforeTruth.truthId,
          inputTruthHash: beforeTruth.truthId,
          outputTruthHash: null,
          inputSummary: JSON.stringify(beforeSnapshot),
          outputSummary: JSON.stringify(snapshotSceneAnalysisState(normalizedResult)),
          mutationDetected: mutations.length > 0,
          mutations,
          expectedTruth: beforeTruth,
          actualTruth: null,
          reason: "finding_truth_removed",
        });
      }

      if (beforeTruth && afterTruth && !isSameFindingTruth(beforeTruth, afterTruth)) {
        const mutations = compareFindingTruth(beforeTruth, afterTruth);
        throw createTruthVerificationError({
          nodeName: node.name,
          nodeLabel: labelForNode(node.name),
          truthId: beforeTruth.truthId,
          inputTruthHash: beforeTruth.truthId,
          outputTruthHash: afterTruth.truthId,
          inputSummary: JSON.stringify(beforeSnapshot),
          outputSummary: JSON.stringify(snapshotSceneAnalysisState(normalizedResult)),
          mutationDetected: mutations.length > 0,
          mutations,
          expectedTruth: beforeTruth,
          actualTruth: afterTruth,
          reason: "finding_truth_changed",
        });
      }

      const finishedAt = new Date().toISOString();
      const finishedAtMs = globalThis.performance?.now?.() ?? Date.now();
      const verification = createNodeTruthVerification({
        nodeName: node.name,
        nodeLabel: labelForNode(node.name),
        input: beforeSnapshot,
        output: snapshotSceneAnalysisState(normalizedResult),
        expectedTruth: beforeTruth,
        actualTruth: afterTruth,
        executionTimeMs: Math.max(0, finishedAtMs - startedAtMs),
        reason: beforeTruth && afterTruth
          ? "finding_truth_preserved"
          : afterTruth
            ? "finding_truth_initialized"
            : "finding_truth_not_yet_initialized",
        truthNode: node.name !== "finalize",
      });
      normalizedResult = freezeSceneAnalysisState({
        ...normalizedResult,
        verificationTrail: Object.freeze([...current.verificationTrail, verification]),
      });
      const traceEntry = createTraceTransition(
        current,
        node.name,
        startedAt,
        finishedAt,
        Math.max(0, finishedAtMs - startedAtMs),
        normalizedResult,
        verification,
      );

      current = appendSceneAnalysisTrace({
        state: normalizedResult,
        entry: traceEntry,
      });

      // Preserve the before snapshot explicitly so future inspection can inspect the exact transition.
      void beforeSnapshot;
    }

    return current;
  }
}

