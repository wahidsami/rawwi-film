import type {
  SceneAnalysisArticleCandidate,
  SceneAnalysisConcept,
  SceneAnalysisEvidenceSpan,
  SceneAnalysisExplanation,
  SceneAnalysisState,
} from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

function pickPrimaryEvidence(state: SceneAnalysisState): SceneAnalysisEvidenceSpan | null {
  return state.evidenceSpans.find((span) => span.spanId === state.primaryEvidenceSpanId) ?? state.evidenceSpans[0] ?? null;
}

function pickPrimaryConcept(state: SceneAnalysisState): SceneAnalysisConcept | null {
  return state.detectedConcepts[0] ?? null;
}

function pickPrimaryArticle(state: SceneAnalysisState): SceneAnalysisArticleCandidate | null {
  return state.legalDecisionCollection?.primaryArticle
    ?? state.legalPrimaryArticle
    ?? state.primaryArticle
    ?? state.legalCandidateArticles[0]
    ?? null;
}

function buildExplanation(
  evidence: SceneAnalysisEvidenceSpan | null,
  concept: SceneAnalysisConcept | null,
  article: SceneAnalysisArticleCandidate | null,
  sceneSummary: string,
): SceneAnalysisExplanation {
  const groundedEvidence = evidence?.text ?? "";
  const conceptLabel = concept?.label ?? "unknown concept";
  const conceptId = concept?.conceptId ?? "unknown";
  const articleLabel = article ? `${article.articleId} (${article.titleAr})` : "unresolved article";
  const articleId = article?.articleId ?? null;
  const articleTitleAr = article?.titleAr ?? null;

  const rationale = [
    evidence ? `Evidence: ${evidence.text}` : "No grounded evidence span was available.",
    concept ? `Concept: ${conceptLabel} (${conceptId})` : "No semantic concept was detected.",
    article ? `Article: ${articleLabel}` : "No primary article was selected.",
    article && concept
      ? `Reason: The grounded evidence expresses ${conceptLabel}, and the Academy maps that concept to article ${article.articleId}.`
      : "Reason: The explanation stays limited to the current grounded scene data.",
    sceneSummary.length > 0 ? "Scene summary reviewed for scene-local context only." : "No scene summary was available.",
  ];

  return Object.freeze({
    summary: article
      ? `Grounded evidence "${groundedEvidence}" expresses ${conceptLabel}, so the Academy maps it to article ${articleLabel}.`
      : `Grounded evidence "${groundedEvidence}" does not resolve to a primary legal article.`,
    groundedEvidence,
    primaryArticleId: articleId,
    primaryArticleTitleAr: articleTitleAr,
    primaryAtomId: null,
    primaryAtomTitleAr: null,
    rationale: Object.freeze(rationale),
  });
}

export function createExplanationNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const explanation = buildExplanation(
      pickPrimaryEvidence(state),
      pickPrimaryConcept(state),
      pickPrimaryArticle(state),
      state.sceneModel?.summary ?? "",
    );

    return freezeSceneAnalysisState({
      ...state,
      explanation,
    });
  };
}
