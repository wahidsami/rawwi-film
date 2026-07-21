import { StateGraph } from "./stateGraph.js";
import type { SceneAnalysisState } from "./sceneAnalysisState.js";
import { createSceneAnalysisState } from "./sceneAnalysisState.js";
import {
  createDefaultSceneAnalysisNodeSequence,
  createFinalizeSceneAnalysisNode,
  createNormalizeSceneStateNode,
  createInterpretSceneNode,
  createSceneUnderstandingNode,
  createRankCandidateArticlesNode,
  createResolveCandidateArticlesNode,
  createResolveCandidateAtomsNode,
  createResolveKnowledgeDomainsNode,
} from "./sceneAnalysisNodes.js";
import { createCandidateEvidenceNode } from "./candidateEvidenceNode.js";
import { createConceptClassificationNode } from "./conceptClassificationNode.js";
import { createExplanationNode } from "./explanationNode.js";
import { createQualityJudgeNode } from "./qualityJudgeNode.js";

export type SceneAnalysisEngineOptions = Readonly<{
  enabled?: boolean;
}>;

export type SceneAnalysisEngine = Readonly<{
  graph: StateGraph;
  run: (sceneId: string, sceneText: string) => Promise<SceneAnalysisState>;
}>;

function buildDefaultGraph(): StateGraph {
  const graph = new StateGraph();
  const understandScene = createSceneUnderstandingNode();
  const interpretScene = createInterpretSceneNode();
  const candidateEvidence = createCandidateEvidenceNode();
  const conceptClassification = createConceptClassificationNode();
  const normalize = createNormalizeSceneStateNode();
  const resolveDomains = createResolveKnowledgeDomainsNode();
  const resolveArticles = createResolveCandidateArticlesNode();
  const rankArticles = createRankCandidateArticlesNode();
  const resolveAtoms = createResolveCandidateAtomsNode();
  const explanation = createExplanationNode();
  const qualityJudge = createQualityJudgeNode();
  const finalize = createFinalizeSceneAnalysisNode();

  graph
    .addNode("understand_scene", understandScene)
    .addNode("interpret_scene", interpretScene)
    .addNode("candidate_evidence", candidateEvidence)
    .addNode("concept_classification", conceptClassification)
    .addNode("normalize_scene", normalize)
    .addNode("resolve_domains", resolveDomains)
    .addNode("resolve_articles", resolveArticles)
    .addNode("rank_articles", rankArticles)
    .addNode("resolve_atoms", resolveAtoms)
    .addNode("explanation", explanation)
    .addNode("quality_judge", qualityJudge)
    .addNode("finalize", finalize)
    .setEntryPoint("understand_scene")
    .addEdge("understand_scene", "interpret_scene")
    .addEdge("interpret_scene", "candidate_evidence")
    .addEdge("candidate_evidence", "concept_classification")
    .addEdge("concept_classification", "normalize_scene")
    .addEdge("normalize_scene", "resolve_domains")
    .addEdge("resolve_domains", "resolve_articles")
    .addEdge("resolve_articles", "rank_articles")
    .addEdge("rank_articles", "resolve_atoms")
    .addEdge("resolve_atoms", "explanation")
    .addEdge("explanation", "quality_judge")
    .addEdge("quality_judge", "finalize");

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
  createFinalizeSceneAnalysisNode,
  createNormalizeSceneStateNode,
  createRankCandidateArticlesNode,
  createResolveCandidateArticlesNode,
  createResolveCandidateAtomsNode,
  createResolveKnowledgeDomainsNode,
  createDefaultSceneAnalysisNodeSequence,
};
