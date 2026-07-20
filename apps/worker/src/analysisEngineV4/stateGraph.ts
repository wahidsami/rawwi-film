import type { SceneAnalysisState } from "./sceneAnalysisState.js";
import { appendSceneAnalysisTrace, createTraceTransition } from "./sceneAnalysisTrace.js";
import { freezeSceneAnalysisState, snapshotSceneAnalysisState } from "./sceneAnalysisState.js";

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
      const startedAt = new Date().toISOString();
      const startedAtMs = globalThis.performance?.now?.() ?? Date.now();

      const nodeResult = await node.execute(current);
      const normalizedResult = freezeSceneAnalysisState({
        ...nodeResult,
        trace: current.trace,
      });

      const finishedAt = new Date().toISOString();
      const finishedAtMs = globalThis.performance?.now?.() ?? Date.now();
      const traceEntry = createTraceTransition(
        current,
        node.name,
        startedAt,
        finishedAt,
        Math.max(0, finishedAtMs - startedAtMs),
        normalizedResult,
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

