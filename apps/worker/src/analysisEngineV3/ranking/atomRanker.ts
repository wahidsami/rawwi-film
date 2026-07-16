import { getCanonicalAtomsForGcam } from "../../canonicalAtomMapping.js";
import { getPolicyAtomTitle, normalizeAtomId } from "../../policyMap.js";
import type {
  ReviewerAcademyArticle,
  ReviewerAcademyAtom,
  ReviewerAcademyRelationshipMap,
} from "../reviewerCompiler/compilerTypes.js";
import { buildKnowledgeRankingCorpus, clampScore, scoreTerms, uniqueStrings } from "../reviewerKnowledge/knowledgeRanking/knowledgeRankingUtils.js";
import type {
  ReviewerAtomRankingItem,
  ReviewerAtomRankingReport,
  ReviewerRankingBaseInput,
} from "./rankingTypes.js";

export type ReviewerAtomRankerInput = ReviewerRankingBaseInput & Readonly<{
  articles: readonly ReviewerAcademyArticle[];
  atomsByArticle: Readonly<Record<string, readonly ReviewerAcademyAtom[]>>;
  relationshipMap: ReviewerAcademyRelationshipMap;
  scopeCategories: readonly string[];
  selectedArticleIds: readonly string[];
  limitPerArticle: number;
}>;

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function parsePolicyArticleId(articleId: string): number {
  const numeric = Number.parseInt(articleId.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function buildAtomCorpus(
  article: ReviewerAcademyArticle,
  atom: ReviewerAcademyAtom,
  policyAtomId: string,
  canonicalAtoms: readonly string[],
): string {
  const policyAtomTitle = getPolicyAtomTitle(parsePolicyArticleId(article.articleId), policyAtomId) ?? "";
  return buildKnowledgeRankingCorpus([
    article.articleId,
    article.reviewer,
    article.title,
    article.protectedInterest,
    article.purpose,
    article.neighboringArticles,
    article.atoms,
    atom.atomId,
    policyAtomId,
    policyAtomTitle,
    atom.articleId,
    atom.reviewer,
    atom.title,
    atom.protectedInterest,
    atom.inherits,
    atom.priority === null ? "" : `priority:${atom.priority}`,
    atom.runtime === null ? "" : `runtime:${atom.runtime}`,
    atom.retrieval ?? {},
    atom.status ?? "",
    canonicalAtoms,
  ]);
}

function scoreAtom(
  article: ReviewerAcademyArticle,
  atom: ReviewerAcademyAtom,
  input: ReviewerAtomRankerInput,
): ReviewerAtomRankingItem {
  const articleNumber = parsePolicyArticleId(article.articleId);
  const policyAtomId = normalizeAtomId(atom.atomId, articleNumber);
  const canonicalAtoms = getCanonicalAtomsForGcam(articleNumber, policyAtomId);
  const corpus = buildAtomCorpus(article, atom, policyAtomId, canonicalAtoms);
  const queryMatch = scoreTerms(corpus, input.queryTerms, 0.09, 0.42);
  const scopeMatch = scoreTerms(corpus, input.scopeCategories, 0.05, 0.24);
  const selectedArticleMatch = input.selectedArticleIds.includes(article.articleId) ? 0.12 : 0;
  const relationshipMatch = input.relationshipMap.reviewers[article.reviewer]?.articles[article.articleId]?.atoms.includes(atom.atomId) ? 0.18 : 0;
  const canonicalBoost = canonicalAtoms.length > 0 ? Math.min(0.08, canonicalAtoms.length * 0.02) : 0;
  const priorityBoost = atom.priority === null ? 0 : clampScore(1 / (atom.priority + 20));
  const runtimeBoost = atom.runtime === true ? 0.02 : 0;
  const policyTitleBoost = getPolicyAtomTitle(articleNumber, policyAtomId) ? 0.04 : 0;
  const score = clampScore(
    queryMatch.score +
    scopeMatch.score +
    selectedArticleMatch +
    relationshipMatch +
    canonicalBoost +
    priorityBoost +
    runtimeBoost +
    policyTitleBoost,
  );

  return Object.freeze({
    atomId: atom.atomId,
    articleId: atom.articleId,
    policyArticleId: articleNumber,
    reviewer: atom.reviewer,
    articleNumber,
    policyAtomId,
    policyAtomTitle: getPolicyAtomTitle(articleNumber, policyAtomId) ?? null,
    canonicalAtoms: Object.freeze([...canonicalAtoms]),
    score,
    confidence: score,
    reasons: Object.freeze(uniqueStrings([
      ...(queryMatch.matchedTerms.length > 0 ? [`query:${queryMatch.matchedTerms.join(",")}`] : []),
      ...(scopeMatch.matchedTerms.length > 0 ? [`scope:${scopeMatch.matchedTerms.join(",")}`] : []),
      ...(selectedArticleMatch > 0 ? ["selected_article"] : []),
      ...(relationshipMatch > 0 ? ["relationship_map"] : []),
      ...(canonicalBoost > 0 ? ["canonical_atom"] : []),
      ...(priorityBoost > 0 ? ["priority"] : []),
      ...(runtimeBoost > 0 ? ["runtime"] : []),
      ...(policyTitleBoost > 0 ? ["policy_title"] : []),
    ])),
    matchedTerms: Object.freeze(uniqueStrings([
      ...queryMatch.matchedTerms,
      ...scopeMatch.matchedTerms,
      atom.title,
      atom.protectedInterest,
      ...canonicalAtoms,
    ])),
    selected: false,
    sourcePath: atom.sourcePath,
    priority: atom.priority,
    runtime: atom.runtime,
    retrievalEnabled: atom.retrieval !== null,
  });
}

export function rankCandidateAtoms(input: ReviewerAtomRankerInput): ReviewerAtomRankingReport {
  const atomScores = input.articles.flatMap((article) => {
    const atoms = input.atomsByArticle[article.articleId] ?? [];
    return atoms.map((atom) => scoreAtom(article, atom, input));
  }).sort((left, right) => right.score - left.score || left.policyArticleId - right.policyArticleId || left.articleId.localeCompare(right.articleId) || left.atomId.localeCompare(right.atomId));

  const selectedAtomIdsByArticle = new Map<string, string[]>();
  const selectedPolicyAtomIdsByArticle = new Map<string, string[]>();
  const selectedByArticle = new Map<string, ReviewerAtomRankingItem[]>();

  for (const article of input.articles) {
    const atoms = atomScores.filter((item) => item.articleId === article.articleId).slice(0, input.limitPerArticle);
    selectedByArticle.set(article.articleId, atoms);
    selectedAtomIdsByArticle.set(article.articleId, atoms.map((item) => item.atomId));
    selectedPolicyAtomIdsByArticle.set(
      article.articleId,
      atoms.map((item) => item.policyAtomId).filter((value): value is string => typeof value === "string" && value.length > 0),
    );
  }

  const selected = [...selectedByArticle.values()].flat().map((item) => Object.freeze({ ...item, selected: true }));
  const selectedAtomIds = selected.map((item) => item.atomId);
  const selectedPolicyAtomIds = selected.map((item) => item.policyAtomId).filter((value): value is string => typeof value === "string" && value.length > 0);

  const selectedAtomCount = selected.length;
  const rejectedAtomCount = Math.max(0, atomScores.length - selectedAtomCount);
  const atomReductionPercent = atomScores.length === 0
    ? 0
    : Number(((rejectedAtomCount / atomScores.length) * 100).toFixed(2));

  return Object.freeze({
    enabled: true,
    selectedReviewerIds: Object.freeze([...input.selectedReviewerIds]),
    selectedReviewerFolders: Object.freeze([...input.selectedReviewerFolders]),
    queryTerms: Object.freeze([...input.queryTerms]),
    atomScores: Object.freeze(atomScores.map((item) => (selectedAtomIds.includes(item.atomId)
      ? Object.freeze({ ...item, selected: true })
      : item))),
    selectedAtomIdsByArticle: Object.freeze(Object.fromEntries([...selectedAtomIdsByArticle.entries()].map(([key, values]) => [key, Object.freeze([...values])]))),
    selectedPolicyAtomIdsByArticle: Object.freeze(Object.fromEntries([...selectedPolicyAtomIdsByArticle.entries()].map(([key, values]) => [key, Object.freeze([...values])]))),
    selectedAtomIds: Object.freeze([...selectedAtomIds]),
    selectedPolicyAtomIds: Object.freeze([...selectedPolicyAtomIds]),
    selectedAtomCount,
    rejectedAtomCount,
    atomReductionPercent,
    limitPerArticle: input.limitPerArticle,
  });
}
