import { createCompiledReviewerContextPromptSection } from "../reviewerCompiler/compilerRenderer.js";
import type {
  ReviewerAcademyArticle,
  ReviewerAcademyAtom,
  ReviewerAcademyManual,
  ReviewerAcademyRegistry,
  ReviewerCompiledContext,
  ReviewerCompiledReviewerPackage,
} from "../reviewerCompiler/compilerTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { getReviewerScopeDeclarationsByIds } from "../reviewerKnowledge/reviewerScopeMatrix.js";
import { buildCandidateRankingSignalTerms, buildCandidateSelectionDiagnostics } from "./candidateDiagnostics.js";
import { rankCandidateArticles } from "./articleRanker.js";
import { rankCandidateAtoms } from "./atomRanker.js";
import type { ReviewerCandidateSelectionDiagnostics } from "./rankingTypes.js";
import { normalizeAtomId } from "../../policyMap.js";

const ROUTER_FOLDER_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  family_values: "society",
  politics: "state",
  profanity: "general",
  sexuality: "sexualcontent",
  travel: "general",
});

function normalizeFolderName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = keyOf(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return Object.freeze(result);
}

function parsePolicyArticleId(articleId: string): number {
  const numeric = Number.parseInt(articleId.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function estimateArticleFootprint(article: ReviewerAcademyArticle): number {
  return [
    article.articleId,
    article.reviewer,
    article.title,
    article.protectedInterest,
    article.purpose,
    article.neighboringArticles.join(", "),
    article.atoms.join(", "),
    article.inherits.join(", "),
  ].join(" ").length;
}

function estimateAtomFootprint(atom: ReviewerAcademyAtom): number {
  return [
    atom.atomId,
    atom.articleId,
    atom.reviewer,
    atom.title,
    atom.protectedInterest,
    atom.inherits.join(", "),
  ].join(" ").length;
}

function normalizeReviewerKey(value: string): string {
  return normalizeFolderName(value).replace(/\breviewer\b/g, "").replace(/\s+/g, "");
}

function resolveReviewerDisplayName(registry: ReviewerAcademyRegistry, folder: string): string {
  const normalized = normalizeFolderName(folder);
  const match = Object.keys(registry.relationshipMap.reviewers).find((reviewer) => normalizeFolderName(reviewer) === normalized);
  return match ?? folder;
}

function resolveAcademyFolder(registry: ReviewerAcademyRegistry, folder: string): string | null {
  const normalized = normalizeFolderName(folder);
  const directFolders = new Set(registry.reviewerFolders.map((entry) => normalizeFolderName(entry)));
  if (directFolders.has(normalized)) {
    return normalized;
  }

  const alias = ROUTER_FOLDER_ALIASES[normalized];
  if (alias && directFolders.has(alias)) {
    return alias;
  }

  const reviewerNameMatch = Object.keys(registry.relationshipMap.reviewers).find((reviewer) => normalizeReviewerKey(reviewer) === normalizeReviewerKey(folder));
  if (reviewerNameMatch) {
    const reviewerFolder = normalizeFolderName(reviewerNameMatch);
    if (directFolders.has(reviewerFolder)) {
      return reviewerFolder;
    }
  }

  for (const candidate of registry.reviewerFolders) {
    const normalizedCandidate = normalizeFolderName(candidate);
    if (normalized.includes(normalizedCandidate) || normalizedCandidate.includes(normalized)) {
      return normalizedCandidate;
    }
  }

  return null;
}

function resolveAcademyFolders(registry: ReviewerAcademyRegistry, folders: readonly string[]): readonly string[] {
  const resolved = folders.flatMap((folder) => {
    if (normalizeFolderName(folder) === "universal") return [];
    const resolvedFolder = resolveAcademyFolder(registry, folder);
    return resolvedFolder ? [resolvedFolder] : [];
  });
  return Object.freeze(uniqueBy(resolved, (folder) => normalizeFolderName(folder)).slice().sort((left, right) => left.localeCompare(right)));
}

function selectManualsByFolder(manualsByFolder: Readonly<Record<string, readonly ReviewerAcademyManual[]>>, folders: readonly string[]): readonly ReviewerAcademyManual[] {
  const selected = folders.flatMap((folder) => manualsByFolder[normalizeFolderName(folder)] ?? []);
  return Object.freeze(selected.slice().sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
}

function selectArticlesByFolder(articlesByReviewer: Readonly<Record<string, readonly ReviewerAcademyArticle[]>>, folders: readonly string[]): readonly ReviewerAcademyArticle[] {
  const selected = folders.flatMap((folder) => articlesByReviewer[normalizeFolderName(folder)] ?? []);
  return Object.freeze(selected.slice().sort((left, right) => left.articleId.localeCompare(right.articleId)));
}

function selectAtomsByArticles(atomsByArticle: Readonly<Record<string, readonly ReviewerAcademyAtom[]>>, articleIds: readonly string[], atomIds?: ReadonlySet<string>): readonly ReviewerAcademyAtom[] {
  const selected = articleIds.flatMap((articleId) => atomsByArticle[articleId] ?? []);
  const filtered = atomIds ? selected.filter((atom) => atomIds.has(atom.atomId)) : selected;
  return Object.freeze(uniqueBy(filtered, (atom) => atom.atomId).slice().sort((left, right) => left.atomId.localeCompare(right.atomId)));
}

function buildCompiledPackages(
  registry: ReviewerAcademyRegistry,
  folders: readonly string[],
  articleIds?: ReadonlySet<string>,
  atomIds?: ReadonlySet<string>,
): readonly ReviewerCompiledReviewerPackage[] {
  const normalizedFolders = uniqueBy(
    folders.map((folder) => normalizeFolderName(folder)).filter((folder) => folder !== "universal"),
    (folder) => folder,
  );

  const packages = normalizedFolders.map((folder) => {
    const manuals = Object.freeze([...(registry.manualsByFolder[folder] ?? [])].sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
    const articles = selectArticlesByFolder(registry.articlesByReviewer, [folder]).filter((article) => !articleIds || articleIds.has(article.articleId));
    const atoms = selectAtomsByArticles(registry.atomsByArticle, articles.map((article) => article.articleId), atomIds);
    const loadedCharacterCount = manuals.reduce((total, manual) => total + manual.characterCount, 0)
      + articles.reduce((total, article) => total + estimateArticleFootprint(article), 0)
      + atoms.reduce((total, atom) => total + estimateAtomFootprint(atom), 0);
    const estimatedTokenCount = Math.max(1, Math.ceil(loadedCharacterCount / 4));

    return Object.freeze({
      reviewer: resolveReviewerDisplayName(registry, folder),
      folder,
      manuals,
      articles,
      atoms,
      loadedManualCount: manuals.length,
      loadedCharacterCount,
      loadedArticleCount: articles.length,
      loadedAtomCount: atoms.length,
      estimatedTokenCount,
    });
  });

  return Object.freeze(packages.sort((left, right) => left.folder.localeCompare(right.folder)));
}

function buildCompiledContext(
  input: Readonly<{
    routing: EmergencyContextualReviewerRoutingReport;
    promptInput: V3PromptBuilderInput;
    conceptContext: ConceptContext;
    assessment: ReviewerAssessment;
    registry: ReviewerAcademyRegistry;
  }>,
): ReviewerCompiledContext {
  const resolvedReviewerFolders = resolveAcademyFolders(input.registry, input.routing.selectedAcademyFolders);
  const selectedReviewerIds = [...input.routing.selectedReviewerIds];
  const selectedReviewerLabels = [...input.routing.selectedReviewerLabels];
  const scopeDeclarations = getReviewerScopeDeclarationsByIds(selectedReviewerIds);
  const scopeCategories = Object.freeze([
    ...new Set(scopeDeclarations.flatMap((declaration) => declaration.ownedCategories)),
  ].sort((left, right) => left.localeCompare(right)));
  const queryTerms = buildCandidateRankingSignalTerms(
    {
      promptInput: input.promptInput,
      conceptContext: input.conceptContext,
      assessment: input.assessment,
    },
    scopeCategories,
  );

  const universalManuals = Object.freeze([...(input.registry.universalManuals ?? [])]);
  const selectedReviewerManuals = selectManualsByFolder(input.registry.manualsByFolder, resolvedReviewerFolders);
  const legacySelectedReviewerPackages = buildCompiledPackages(input.registry, resolvedReviewerFolders);
  const legacySelectedArticles = Object.freeze(
    uniqueBy(
      legacySelectedReviewerPackages.flatMap((reviewerPackage) => reviewerPackage.articles),
      (article) => article.articleId,
    ).slice().sort((left, right) => left.articleId.localeCompare(right.articleId)),
  );
  const legacySelectedAtoms = Object.freeze(
    uniqueBy(
      legacySelectedReviewerPackages.flatMap((reviewerPackage) => reviewerPackage.atoms),
      (atom) => atom.atomId,
    ).slice().sort((left, right) => left.atomId.localeCompare(right.atomId)),
  );

  const articleRanking = rankCandidateArticles({
    promptInput: input.promptInput,
    conceptContext: input.conceptContext,
    assessment: input.assessment,
    selectedReviewerIds,
    selectedReviewerFolders: resolvedReviewerFolders,
    queryTerms,
    articles: legacySelectedArticles,
    relationshipMap: input.registry.relationshipMap,
    scopeCategories,
    limitPerReviewer: 2,
  });

  const selectedArticles = Object.freeze(
    articleRanking.selectedArticleIds
      .map((articleId) => input.registry.articlesById[articleId])
      .filter((article): article is ReviewerAcademyArticle => Boolean(article))
      .sort((left, right) => {
        const leftScore = articleRanking.articleScores.find((item) => item.articleId === left.articleId)?.score ?? 0;
        const rightScore = articleRanking.articleScores.find((item) => item.articleId === right.articleId)?.score ?? 0;
        return rightScore - leftScore || left.articleId.localeCompare(right.articleId);
      }),
  );
  const selectedArticleIds = new Set(selectedArticles.map((article) => article.articleId));
  const atomRanking = rankCandidateAtoms({
    promptInput: input.promptInput,
    conceptContext: input.conceptContext,
    assessment: input.assessment,
    selectedReviewerIds,
    selectedReviewerFolders: resolvedReviewerFolders,
    queryTerms,
    articles: selectedArticles,
    atomsByArticle: input.registry.atomsByArticle,
    relationshipMap: input.registry.relationshipMap,
    scopeCategories,
    selectedArticleIds: [...selectedArticleIds],
    limitPerArticle: 3,
  });

  const selectedAtoms = Object.freeze(
    atomRanking.selectedAtomIds
      .map((atomId) => input.registry.atomsById[atomId])
      .filter((atom): atom is ReviewerAcademyAtom => Boolean(atom))
      .sort((left, right) => {
        const leftScore = atomRanking.atomScores.find((item) => item.atomId === left.atomId)?.score ?? 0;
        const rightScore = atomRanking.atomScores.find((item) => item.atomId === right.atomId)?.score ?? 0;
        return rightScore - leftScore || left.atomId.localeCompare(right.atomId);
      }),
  );
  const selectedAtomIds = new Set(selectedAtoms.map((atom) => atom.atomId));
  const candidateReviewerPackages = buildCompiledPackages(
    input.registry,
    resolvedReviewerFolders,
    selectedArticleIds,
    selectedAtomIds,
  );
  const legacyReviewerPackages = legacySelectedReviewerPackages;

  const candidateLoadedManualCount = universalManuals.length + selectedReviewerManuals.length;
  const candidateLoadedReviewerCount = candidateReviewerPackages.length;
  const candidateLoadedArticleCount = selectedArticles.length;
  const candidateLoadedAtomCount = selectedAtoms.length;
  const candidateLoadedCharacterCount = universalManuals.reduce((total, manual) => total + manual.characterCount, 0)
    + selectedReviewerManuals.reduce((total, manual) => total + manual.characterCount, 0)
    + selectedArticles.reduce((total, article) => total + estimateArticleFootprint(article), 0)
    + selectedAtoms.reduce((total, atom) => total + estimateAtomFootprint(atom), 0);
  const candidateEstimatedTokenCount = Math.max(1, Math.ceil(candidateLoadedCharacterCount / 4));

  const legacyLoadedManualCount = candidateLoadedManualCount;
  const legacyLoadedReviewerCount = legacyReviewerPackages.length;
  const legacyLoadedArticleCount = legacySelectedArticles.length;
  const legacyLoadedAtomCount = legacySelectedAtoms.length;
  const legacyLoadedCharacterCount = universalManuals.reduce((total, manual) => total + manual.characterCount, 0)
    + selectedReviewerManuals.reduce((total, manual) => total + manual.characterCount, 0)
    + legacySelectedArticles.reduce((total, article) => total + estimateArticleFootprint(article), 0)
    + legacySelectedAtoms.reduce((total, atom) => total + estimateAtomFootprint(atom), 0);
  const legacyEstimatedTokenCount = Math.max(1, Math.ceil(legacyLoadedCharacterCount / 4));

  const candidateSelection = Object.freeze({
    selectedReviewerIds: Object.freeze([...selectedReviewerIds]),
    selectedReviewerLabels: Object.freeze([...selectedReviewerLabels]),
    selectedAcademyFolders: Object.freeze(["universal", ...resolvedReviewerFolders]),
    rejectedReviewerIds: Object.freeze([...input.routing.rejectedReviewerIds]),
    rejectedReviewerLabels: Object.freeze([...input.routing.rejectedReviewerLabels]),
    loadedAcademyCount: resolvedReviewerFolders.length + 1,
    skippedAcademyCount: Math.max(0, input.registry.reviewerFolders.length + 1 - (resolvedReviewerFolders.length + 1)),
    knowledgeReductionPercent: input.registry.reviewerFolders.length + 1 === 0
      ? 0
      : Number((((Math.max(0, input.registry.reviewerFolders.length + 1 - (resolvedReviewerFolders.length + 1))) / (input.registry.reviewerFolders.length + 1)) * 100).toFixed(2)),
    routingConfidence: input.routing.routingConfidence,
    routingReason: input.routing.routingReason,
    lowConfidence: input.routing.lowConfidence,
    reviewerScores: input.routing.reviewerScores,
  });

  const legacyContextBase = {
    academyRoot: input.registry.rootDir,
    fingerprint: input.registry.fingerprint,
    generatedAt: input.registry.loadedAt,
    selection: candidateSelection,
    universalManuals,
    selectedReviewerManuals,
    rejectedReviewerManuals: Object.freeze(
      input.registry.reviewerFolders
        .filter((folder) => !resolvedReviewerFolders.some((selectedFolder) => normalizeFolderName(selectedFolder) === normalizeFolderName(folder)))
        .flatMap((folder) => input.registry.manualsByFolder[folder] ?? []),
    ),
    selectedReviewerPackages: legacyReviewerPackages,
    selectedArticles: legacySelectedArticles,
    selectedAtoms: legacySelectedAtoms,
    loadedManualCount: legacyLoadedManualCount,
    loadedReviewerCount: legacyLoadedReviewerCount,
    loadedArticleCount: legacyLoadedArticleCount,
    loadedAtomCount: legacyLoadedAtomCount,
    loadedCharacterCount: legacyLoadedCharacterCount,
    estimatedTokenCount: legacyEstimatedTokenCount,
    promptCharacterCount: 0,
    promptTokenEstimate: 0,
    promptPreview: "",
  } satisfies ReviewerCompiledContext;

  const candidateContextBase = {
    ...legacyContextBase,
    selectedReviewerPackages: candidateReviewerPackages,
    selectedArticles,
    selectedAtoms,
    loadedReviewerCount: candidateLoadedReviewerCount,
    loadedArticleCount: candidateLoadedArticleCount,
    loadedAtomCount: candidateLoadedAtomCount,
    loadedCharacterCount: candidateLoadedCharacterCount,
    estimatedTokenCount: candidateEstimatedTokenCount,
  } satisfies ReviewerCompiledContext;

  const legacyPromptPreview = createCompiledReviewerContextPromptSection(Object.freeze(legacyContextBase)).body;
  const candidatePromptPreview = createCompiledReviewerContextPromptSection(Object.freeze(candidateContextBase)).body;
  const candidatePromptCharacterCount = candidatePromptPreview.length;
  const legacyPromptCharacterCount = legacyPromptPreview.length;
  const finalAcceptedCandidate = selectedArticles.length > 0
    ? {
        articleId: selectedArticles[0]?.articleId ?? "",
        policyArticleId: parsePolicyArticleId(selectedArticles[0]?.articleId ?? ""),
        atomId: selectedAtoms[0]?.atomId ?? null,
        policyAtomId: selectedAtoms[0] ? normalizeAtomId(selectedAtoms[0].atomId, parsePolicyArticleId(selectedAtoms[0].articleId)) : null,
        reviewer: selectedArticles[0]?.reviewer ?? "",
        title: selectedArticles[0]?.title ?? "",
      }
    : null;

  const candidateDiagnostics: ReviewerCandidateSelectionDiagnostics = buildCandidateSelectionDiagnostics({
    enabled: true,
    routing: input.routing,
    resolvedReviewerFolders,
    selectedReviewerIds,
    selectedReviewerLabels,
    rejectedReviewerIds: input.routing.rejectedReviewerIds,
    rejectedReviewerLabels: input.routing.rejectedReviewerLabels,
    reviewerScores: input.routing.reviewerScores,
    articleRanking,
    atomRanking,
    legacyArticleCount: legacyLoadedArticleCount,
    legacyAtomCount: legacyLoadedAtomCount,
    legacyPromptCharacterCount,
    candidatePromptCharacterCount,
    finalAcceptedCandidate,
  });

  return Object.freeze({
    ...candidateContextBase,
    promptCharacterCount: candidatePromptCharacterCount,
    promptTokenEstimate: Math.max(1, Math.ceil(candidatePromptCharacterCount / 4)),
    promptPreview: candidatePromptPreview,
    candidateDiagnostics,
  });
}

export function createDeterministicCandidateCompiledContext(input: Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
  registry: ReviewerAcademyRegistry;
}>): ReviewerCompiledContext {
  return buildCompiledContext(input);
}
