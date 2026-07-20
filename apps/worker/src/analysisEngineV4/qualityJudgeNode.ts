import type {
  SceneAnalysisConcept,
  SceneAnalysisExplanation,
  SceneAnalysisQualityJudgment,
  SceneAnalysisState,
} from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

const OTHER_SCENE_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother scene\b/iu,
  /\bprevious scene\b/iu,
  /\blater scene\b/iu,
  /\bother scene\b/iu,
  /\bscene\s*\d+\b/iu,
  /\bمشهد\s*\d+\b/u,
  /\bالمشهد\s*\d+\b/u,
  /\belsewhere\b/iu,
]);

const OTHER_FINDING_PATTERNS: readonly RegExp[] = Object.freeze([
  /\banother finding\b/iu,
  /\bother finding\b/iu,
  /\bprevious finding\b/iu,
  /\bnext finding\b/iu,
  /\bfinding\s*\d+\b/iu,
  /\bfinding\b/iu,
]);

const INVENTED_FACT_PATTERNS: readonly RegExp[] = Object.freeze([
  /\binvented\b/iu,
  /\bfake\b/iu,
  /\bfalse\b/iu,
  /\bimaginary\b/iu,
  /\bnot present\b/iu,
  /\bunknown character\b/iu,
]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function includesNormalized(haystack: string, needle: string | null | undefined): boolean {
  if (!needle) return false;
  return normalizeText(haystack).includes(normalizeText(needle));
}

function pickEvidenceText(state: SceneAnalysisState): string {
  return state.explanation?.groundedEvidence ?? state.evidenceSpans.find((span) => span.spanId === state.primaryEvidenceSpanId)?.text ?? state.evidenceSpans[0]?.text ?? "";
}

function pickPrimaryConcept(state: SceneAnalysisState): SceneAnalysisConcept | null {
  return state.detectedConcepts[0] ?? null;
}

function pickPrimaryArticleTitle(state: SceneAnalysisState): string | null {
  return state.legalPrimaryArticle?.titleAr ?? state.primaryArticle?.titleAr ?? null;
}

function buildJudgment(state: SceneAnalysisState): SceneAnalysisQualityJudgment {
  const explanation: SceneAnalysisExplanation | null = state.explanation;
  const evidenceText = pickEvidenceText(state);
  const concept = pickPrimaryConcept(state);
  const articleTitle = pickPrimaryArticleTitle(state);
  const sceneSummary = state.sceneModel?.summary ?? "";
  const explanationText = [explanation?.summary ?? "", ...(explanation?.rationale ?? [])].join(" ");
  const characterNames = state.sceneModel?.characters ?? [];

  const quoteExists = evidenceText.length > 0
    && state.evidenceSpans.some((span) => normalizeText(span.text) === normalizeText(evidenceText));

  const explanationReferencesQuote = quoteExists && includesNormalized(explanationText, evidenceText);

  const articleMatchesConcept = Boolean(
    explanation?.primaryArticleId != null
      && state.legalCandidateArticles.some((candidate) => candidate.articleId === explanation.primaryArticleId)
      && (state.detectedConcepts.length === 0 || Boolean(concept))
      && (state.legalPrimaryArticle?.articleId ?? state.primaryArticle?.articleId ?? null) === explanation.primaryArticleId,
  );

  const sceneSummarySupportsExplanation = Boolean(
    sceneSummary.length > 0
      && explanation?.summary
      && (
        includesNormalized(explanation.summary, evidenceText)
        || (concept ? includesNormalized(explanation.summary, concept.label) : false)
        || includesNormalized(explanation.summary, articleTitle)
      ),
  );

  const explanationMentionsAnotherFinding = OTHER_FINDING_PATTERNS.some((pattern) => pattern.test(explanationText));

  const explanationMentionsAnotherScene = OTHER_SCENE_PATTERNS.some((pattern) => pattern.test(explanationText));

  const explanationInventsFacts = INVENTED_FACT_PATTERNS.some((pattern) => pattern.test(explanationText))
    || (characterNames.length > 0 && characterNames.some((name) => !includesNormalized(state.sceneText, name) && includesNormalized(explanationText, name)));

  const rejectionReasons: string[] = [];
  if (!quoteExists) rejectionReasons.push("quote_missing");
  if (!explanationReferencesQuote) rejectionReasons.push("explanation_does_not_reference_quote");
  if (!articleMatchesConcept) rejectionReasons.push("article_does_not_match_concept");
  if (!sceneSummarySupportsExplanation) rejectionReasons.push("scene_summary_does_not_support_explanation");
  if (explanationMentionsAnotherFinding) rejectionReasons.push("explanation_mentions_another_finding");
  if (explanationInventsFacts || explanationMentionsAnotherScene) rejectionReasons.push("hallucination_detected");

  return Object.freeze({
    status: rejectionReasons.length === 0 ? "pass" : "reject",
    quoteExists,
    explanationReferencesQuote,
    articleMatchesConcept,
    sceneSummarySupportsExplanation,
    explanationMentionsAnotherFinding,
    explanationInventsFacts: explanationInventsFacts || explanationMentionsAnotherScene,
    rejectionReasons: Object.freeze(rejectionReasons),
  });
}

export function createQualityJudgeNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const qualityJudgment = buildJudgment(state);
    return freezeSceneAnalysisState({
      ...state,
      qualityJudgment,
      status: qualityJudgment.status === "reject" ? "failed" : state.status,
    });
  };
}
