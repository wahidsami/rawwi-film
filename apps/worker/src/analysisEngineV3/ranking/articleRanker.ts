import { getPolicyArticle } from "../../policyMap.js";
import type {
  ReviewerAcademyArticle,
  ReviewerAcademyRelationshipMap,
} from "../reviewerCompiler/compilerTypes.js";
import { buildKnowledgeRankingCorpus, clampScore, scoreTerms, uniqueStrings } from "../reviewerKnowledge/knowledgeRanking/knowledgeRankingUtils.js";
import type {
  ReviewerArticleRankingItem,
  ReviewerArticleRankingReport,
  ReviewerRankingBaseInput,
} from "./rankingTypes.js";

export type ReviewerArticleRankerInput = ReviewerRankingBaseInput & Readonly<{
  articles: readonly ReviewerAcademyArticle[];
  relationshipMap: ReviewerAcademyRelationshipMap;
  scopeCategories: readonly string[];
  limitPerReviewer: number;
}>;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function parsePolicyArticleId(articleId: string): number {
  const numeric = Number.parseInt(articleId.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildArticleCorpus(article: ReviewerAcademyArticle, matchedAtomTitles: readonly string[]): string {
  const policyArticle = getPolicyArticle(parsePolicyArticleId(article.articleId));
  return buildKnowledgeRankingCorpus([
    article.articleId,
    policyArticle?.title_ar ?? "",
    article.reviewer,
    article.title,
    article.protectedInterest,
    article.purpose,
    article.neighboringArticles,
    article.atoms,
    article.inherits,
    article.priority === null ? "" : `priority:${article.priority}`,
    article.runtime === null ? "" : `runtime:${article.runtime}`,
    article.retrieval ?? {},
    article.status ?? "",
    matchedAtomTitles,
  ]);
}

function buildMatchedAtomTitles(article: ReviewerAcademyArticle, relationshipMap: ReviewerArticleRankerInput["relationshipMap"]): readonly string[] {
  const reviewerGroup = relationshipMap.reviewers[article.reviewer] ?? null;
  const relationshipArticle = reviewerGroup?.articles[article.articleId] ?? null;
  return uniqueStrings([
    ...(article.atoms ?? []),
    ...(relationshipArticle?.atoms ?? []),
  ]);
}

function scoreArticle(
  article: ReviewerAcademyArticle,
  input: ReviewerArticleRankerInput,
): ReviewerArticleRankingItem {
  const policyArticleId = parsePolicyArticleId(article.articleId);
  const matchedAtomTitles = buildMatchedAtomTitles(article, input.relationshipMap);
  const corpus = buildArticleCorpus(article, matchedAtomTitles);
  const queryMatch = scoreTerms(corpus, input.queryTerms, 0.08, 0.36);
  const scopeMatch = scoreTerms(corpus, input.scopeCategories, 0.05, 0.22);
  const selectedFolderMatch = input.selectedReviewerFolders.some((folder) => normalizeText(folder) === normalizeText(article.reviewer))
    ? 0.2
    : 0;
  const relationshipMatch = input.relationshipMap.reviewers[article.reviewer]?.articles[article.articleId] ? 0.14 : 0;
  const priorityBoost = article.priority === null ? 0 : clampScore(1 / (article.priority + 20));
  const runtimeBoost = article.runtime === true ? 0.02 : 0;
  const score = clampScore(
    queryMatch.score +
    scopeMatch.score +
    selectedFolderMatch +
    relationshipMatch +
    priorityBoost +
    runtimeBoost,
  );

  return Object.freeze({
    articleId: article.articleId,
    policyArticleId,
    reviewer: article.reviewer,
    articleNumber: Number.isFinite(policyArticleId) ? policyArticleId : null,
    policyTitle: getPolicyArticle(policyArticleId)?.title_ar ?? null,
    score,
    confidence: score,
    reasons: Object.freeze(uniqueStrings([
      ...(queryMatch.matchedTerms.length > 0 ? [`query:${queryMatch.matchedTerms.join(",")}`] : []),
      ...(scopeMatch.matchedTerms.length > 0 ? [`scope:${scopeMatch.matchedTerms.join(",")}`] : []),
      ...(selectedFolderMatch > 0 ? ["selected_reviewer"] : []),
      ...(relationshipMatch > 0 ? ["relationship_map"] : []),
      ...(priorityBoost > 0 ? ["priority"] : []),
      ...(runtimeBoost > 0 ? ["runtime"] : []),
    ])),
    matchedTerms: Object.freeze(uniqueStrings([
      ...queryMatch.matchedTerms,
      ...scopeMatch.matchedTerms,
      ...matchedAtomTitles,
    ])),
    selected: false,
    sourcePath: article.sourcePath,
    priority: article.priority,
    runtime: article.runtime,
    retrievalEnabled: article.retrieval !== null,
    atomCount: article.atoms.length,
  });
}

export function rankCandidateArticles(input: ReviewerArticleRankerInput): ReviewerArticleRankingReport {
  const articleScores = input.articles
    .map((article) => scoreArticle(article, input))
    .sort((left, right) => right.score - left.score || left.policyArticleId - right.policyArticleId || left.articleId.localeCompare(right.articleId));

  const selected = articleScores.slice(0, input.limitPerReviewer).map((item) => Object.freeze({ ...item, selected: true }));
  const selectedArticleIds = selected.map((item) => item.articleId);
  const selectedPolicyArticleIds = selected.map((item) => item.policyArticleId);

  const selectedArticleIdsByReviewer = new Map<string, string[]>();
  const selectedPolicyArticleIdsByReviewer = new Map<string, number[]>();
  for (const item of selected) {
    const reviewerKey = item.reviewer;
    const selectedIds = selectedArticleIdsByReviewer.get(reviewerKey) ?? [];
    selectedIds.push(item.articleId);
    selectedArticleIdsByReviewer.set(reviewerKey, selectedIds);

    const selectedPolicyIds = selectedPolicyArticleIdsByReviewer.get(reviewerKey) ?? [];
    selectedPolicyIds.push(item.policyArticleId);
    selectedPolicyArticleIdsByReviewer.set(reviewerKey, selectedPolicyIds);
  }

  const selectedArticleCount = selected.length;
  const rejectedArticleCount = Math.max(0, articleScores.length - selectedArticleCount);
  const articleReductionPercent = articleScores.length === 0
    ? 0
    : Number(((rejectedArticleCount / articleScores.length) * 100).toFixed(2));

  return Object.freeze({
    enabled: true,
    selectedReviewerIds: Object.freeze([...input.selectedReviewerIds]),
    selectedReviewerFolders: Object.freeze([...input.selectedReviewerFolders]),
    queryTerms: Object.freeze([...input.queryTerms]),
    articleScores: Object.freeze(articleScores.map((item) => (selectedArticleIds.includes(item.articleId)
      ? Object.freeze({ ...item, selected: true })
      : item))),
    selectedArticleIdsByReviewer: Object.freeze(Object.fromEntries([...selectedArticleIdsByReviewer.entries()].map(([key, values]) => [key, Object.freeze([...values])]))),
    selectedPolicyArticleIdsByReviewer: Object.freeze(Object.fromEntries([...selectedPolicyArticleIdsByReviewer.entries()].map(([key, values]) => [key, Object.freeze([...values])]))),
    selectedArticleIds: Object.freeze([...selectedArticleIds]),
    selectedPolicyArticleIds: Object.freeze([...selectedPolicyArticleIds]),
    selectedArticleCount,
    rejectedArticleCount,
    articleReductionPercent,
    limitPerReviewer: input.limitPerReviewer,
  });
}
