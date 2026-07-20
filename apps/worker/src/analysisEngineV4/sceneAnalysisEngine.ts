import { StateGraph } from "./stateGraph.js";
import type { SceneAnalysisState } from "./sceneAnalysisState.js";
import { createSceneAnalysisState } from "./sceneAnalysisState.js";
import {
  createComposeExplanationNode,
  createDefaultSceneAnalysisNodeSequence,
  createDetectConceptsNode,
  createExtractEvidenceSpansNode,
  createFinalizeSceneAnalysisNode,
  createNormalizeSceneStateNode,
  createRankCandidateArticlesNode,
  createResolveCandidateArticlesNode,
  createResolveCandidateAtomsNode,
  createResolveKnowledgeDomainsNode,
} from "./sceneAnalysisNodes.js";

export type SceneAnalysisEngineOptions = Readonly<{
  enabled?: boolean;
}>;

export type SceneAnalysisEngine = Readonly<{
  graph: StateGraph;
  run: (sceneId: string, sceneText: string) => Promise<SceneAnalysisState>;
}>;

function buildDefaultGraph(): StateGraph {
  const graph = new StateGraph();
  const normalize = createNormalizeSceneStateNode();
  const extractEvidence = createExtractEvidenceSpansNode();
  const detectConcepts = createDetectConceptsNode();
  const resolveDomains = createResolveKnowledgeDomainsNode();
  const resolveArticles = createResolveCandidateArticlesNode();
  const rankArticles = createRankCandidateArticlesNode();
  const resolveAtoms = createResolveCandidateAtomsNode();
  const composeExplanation = createComposeExplanationNode();
  const finalize = createFinalizeSceneAnalysisNode();

  graph
    .addNode("normalize_scene", normalize)
    .addNode("extract_evidence", extractEvidence)
    .addNode("detect_concepts", detectConcepts)
    .addNode("resolve_domains", resolveDomains)
    .addNode("resolve_articles", resolveArticles)
    .addNode("rank_articles", rankArticles)
    .addNode("resolve_atoms", resolveAtoms)
    .addNode("compose_explanation", composeExplanation)
    .addNode("finalize", finalize)
    .setEntryPoint("normalize_scene")
    .addEdge("normalize_scene", "extract_evidence")
    .addEdge("extract_evidence", "detect_concepts")
    .addEdge("detect_concepts", "resolve_domains")
    .addEdge("resolve_domains", "resolve_articles")
    .addEdge("resolve_articles", "rank_articles")
    .addEdge("rank_articles", "resolve_atoms")
    .addEdge("resolve_atoms", "compose_explanation")
    .addEdge("compose_explanation", "finalize");

  return graph;
}

export function createSceneAnalysisEngine(options: SceneAnalysisEngineOptions = {}): SceneAnalysisEngine {
  const enabled = options.enabled ?? true;
  const graph = buildDefaultGraph();
  const compiled = graph.compile();

  return Object.freeze({
    graph,
    async run(sceneId: string, sceneText: string): Promise<SceneAnalysisState> {
      if (!enabled) {
        return createSceneAnalysisState({ sceneId, sceneText });
      }

      return compiled.invoke(createSceneAnalysisState({ sceneId, sceneText }));
    },
  });
}

export async function runSceneAnalysis(sceneId: string, sceneText: string, options: SceneAnalysisEngineOptions = {}): Promise<SceneAnalysisState> {
  return createSceneAnalysisEngine(options).run(sceneId, sceneText);
}

export {
  createComposeExplanationNode,
  createDetectConceptsNode,
  createExtractEvidenceSpansNode,
  createFinalizeSceneAnalysisNode,
  createNormalizeSceneStateNode,
  createRankCandidateArticlesNode,
  createResolveCandidateArticlesNode,
  createResolveCandidateAtomsNode,
  createResolveKnowledgeDomainsNode,
  createDefaultSceneAnalysisNodeSequence,
};

