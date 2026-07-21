import type { SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { mapLegalDecisions } from "./legalMappingEngine.js";

function resolveKnowledgeDomains(state: SceneAnalysisState): readonly string[] {
  const domains = new Set<string>();
  const concepts = state.conceptCollection?.concepts ?? state.detectedConcepts;
  for (const concept of concepts) {
    for (const domain of concept.knowledgeDomains) {
      domains.add(domain);
    }
  }
  if (domains.size === 0) {
    return Object.freeze(["general"]);
  }
  return Object.freeze([...domains].sort((left, right) => left.localeCompare(right)));
}

export function createLegalMappingNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const legalDecisionCollection = mapLegalDecisions({
      sceneId: state.sceneId,
      conceptCollection: state.conceptCollection,
      detectedConcepts: state.detectedConcepts,
      state,
    });

    return freezeSceneAnalysisState({
      ...state,
      knowledgeDomains: resolveKnowledgeDomains(state),
      legalDecisionCollection,
      legalCandidateArticles: legalDecisionCollection.candidateArticles,
      legalPrimaryArticle: legalDecisionCollection.primaryArticle,
      legalSecondaryArticles: legalDecisionCollection.secondaryArticles,
      legalSupportingArticles: legalDecisionCollection.supportingArticles,
      candidateArticles: legalDecisionCollection.rankedCandidateArticles,
      rankedCandidateArticles: legalDecisionCollection.rankedCandidateArticles,
      primaryArticle: legalDecisionCollection.primaryArticle,
      secondaryArticles: legalDecisionCollection.secondaryArticles,
    });
  };
}
