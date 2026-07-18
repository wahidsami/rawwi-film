import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { config } from "../../config.js";
import { logger } from "../../logger.js";
import { createDeterministicCandidateCompiledContext } from "../ranking/candidateEngine.js";
import { ensureReviewerAcademyRegistry } from "./compilerLoader.js";
import { resolveReviewerCompilerSelection } from "./compilerResolver.js";
import { createCompiledReviewerContextPromptSection, summarizeCompilerOutput } from "./compilerRenderer.js";
import type {
  ReviewerAcademyArticle,
  ReviewerAcademyAtom,
  ReviewerAcademyManual,
  ReviewerCompiledContext,
  ReviewerCompiledReviewerPackage,
  ReviewerCompilerOutput,
} from "./compilerTypes.js";

export type ReviewerCompilerInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>;

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

function selectManualsByFolder(manualsByFolder: Readonly<Record<string, readonly ReviewerAcademyManual[]>>, folders: readonly string[]): readonly ReviewerAcademyManual[] {
  const selected = folders.flatMap((folder) => manualsByFolder[normalizeFolderName(folder)] ?? []);
  return Object.freeze(selected.slice().sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
}

function selectArticlesByFolder(articlesByReviewer: Readonly<Record<string, readonly ReviewerAcademyArticle[]>>, folders: readonly string[]): readonly ReviewerAcademyArticle[] {
  const selected = folders.flatMap((folder) => articlesByReviewer[normalizeFolderName(folder)] ?? []);
  return Object.freeze(selected.slice().sort((left, right) => left.articleId.localeCompare(right.articleId)));
}

function selectAtomsByArticles(atomsByArticle: Readonly<Record<string, readonly ReviewerAcademyAtom[]>>, articleIds: readonly string[]): readonly ReviewerAcademyAtom[] {
  const selected = articleIds.flatMap((articleId) => atomsByArticle[articleId] ?? []);
  return Object.freeze(uniqueBy(selected, (atom) => atom.atomId).slice().sort((left, right) => left.atomId.localeCompare(right.atomId)));
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

function resolveReviewerDisplayName(registry: ReturnType<typeof ensureReviewerAcademyRegistry>, folder: string): string {
  const normalized = normalizeFolderName(folder);
  const match = Object.keys(registry.relationshipMap.reviewers).find((reviewer) => normalizeFolderName(reviewer) === normalized);
  return match ?? folder;
}

function buildReviewerPackages(registry: ReturnType<typeof ensureReviewerAcademyRegistry>, folders: readonly string[]): readonly ReviewerCompiledReviewerPackage[] {
  const normalizedFolders = uniqueBy(
    folders.map((folder) => normalizeFolderName(folder)).filter((folder) => folder !== "universal"),
    (folder) => folder,
  );

  const packages = normalizedFolders.map((folder) => {
    const manuals = Object.freeze([...(registry.manualsByFolder[folder] ?? [])].sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
    const articles = selectArticlesByFolder(registry.articlesByReviewer, [folder]);
    const atoms = selectAtomsByArticles(registry.atomsByArticle, articles.map((article) => article.articleId));
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

function buildCompiledReviewerContext(input: ReviewerCompilerInput, registry: ReturnType<typeof ensureReviewerAcademyRegistry>): ReviewerCompilerOutput {
  const resolution = resolveReviewerCompilerSelection({
    promptInput: input.promptInput,
    conceptContext: input.conceptContext,
    assessment: input.assessment,
  });

  if (config.DETERMINISTIC_CANDIDATES_ENABLED) {
    return Object.freeze({
      registry,
      routing: resolution.routing,
      compiledReviewerContext: createDeterministicCandidateCompiledContext({
        routing: resolution.routing,
        promptInput: input.promptInput,
        conceptContext: input.conceptContext,
        assessment: input.assessment,
        registry,
      }),
    });
  }

  const selectedFolders = resolution.selectedFolders.filter((folder) => normalizeFolderName(folder) !== "universal");
  const universalManuals = Object.freeze([...(registry.universalManuals ?? [])]);
  const selectedReviewerManuals = selectManualsByFolder(registry.manualsByFolder, selectedFolders);
  const selectedReviewerPackages = buildReviewerPackages(registry, selectedFolders);
  const selectedArticles = Object.freeze(
    uniqueBy(
      selectedReviewerPackages.flatMap((reviewerPackage) => reviewerPackage.articles),
      (article) => article.articleId,
    ).slice().sort((left, right) => left.articleId.localeCompare(right.articleId)),
  );
  const selectedAtoms = Object.freeze(
    uniqueBy(
      selectedReviewerPackages.flatMap((reviewerPackage) => reviewerPackage.atoms),
      (atom) => atom.atomId,
    ).slice().sort((left, right) => left.atomId.localeCompare(right.atomId)),
  );
  const rejectedReviewerManuals = Object.freeze(
    registry.reviewerFolders
      .filter((folder) => !selectedFolders.some((selectedFolder) => normalizeFolderName(selectedFolder) === normalizeFolderName(folder)))
      .flatMap((folder) => registry.manualsByFolder[folder] ?? []),
  );

  const loadedManuals = Object.freeze([...universalManuals, ...selectedReviewerManuals]);
  const loadedReviewerCount = selectedReviewerPackages.length;
  const loadedArticleCount = selectedArticles.length;
  const loadedAtomCount = selectedAtoms.length;
  const loadedCharacterCount = loadedManuals.reduce((total, manual) => total + manual.characterCount, 0)
    + selectedArticles.reduce((total, article) => total + estimateArticleFootprint(article), 0)
    + selectedAtoms.reduce((total, atom) => total + estimateAtomFootprint(atom), 0);
  const estimatedTokenCount = Math.max(1, Math.ceil(loadedCharacterCount / 4));
  const promptSectionCharacterCount = loadedManuals.reduce((total, manual) => total + manual.content.length + manual.title.length, 0)
    + selectedArticles.reduce((total, article) => total + estimateArticleFootprint(article), 0)
    + selectedAtoms.reduce((total, atom) => total + estimateAtomFootprint(atom), 0);
  const promptSectionTokenEstimate = Math.max(1, Math.ceil(promptSectionCharacterCount / 4));

  const selection = Object.freeze({
    selectedReviewerIds: resolution.routing.selectedReviewerIds,
    selectedReviewerLabels: resolution.routing.selectedReviewerLabels,
    selectedAcademyFolders: resolution.routing.selectedAcademyFolders,
    rejectedReviewerIds: resolution.routing.rejectedReviewerIds,
    rejectedReviewerLabels: resolution.routing.rejectedReviewerLabels,
    loadedAcademyCount: resolution.routing.loadedAcademyCount,
    skippedAcademyCount: resolution.routing.skippedAcademyCount,
    knowledgeReductionPercent: resolution.routing.knowledgeReductionPercent,
    routingConfidence: resolution.routing.routingConfidence,
    routingReason: resolution.routing.routingReason,
    lowConfidence: resolution.routing.lowConfidence,
    reviewerScores: resolution.routing.reviewerScores,
  });

  const baseCompiledReviewerContext = {
    academyRoot: registry.rootDir,
    fingerprint: registry.fingerprint,
    generatedAt: registry.loadedAt,
    selection,
    universalManuals,
    selectedReviewerManuals,
    rejectedReviewerManuals,
    selectedReviewerPackages,
    selectedArticles,
    selectedAtoms,
    selectedPolicyArticleIds: Object.freeze(selectedArticles.map((article) => parsePolicyArticleId(article.articleId))),
    selectedPolicyAtomIds: Object.freeze(selectedAtoms.map((atom) => atom.atomId)),
    loadedManualCount: loadedManuals.length,
    loadedReviewerCount,
    loadedArticleCount,
    loadedAtomCount,
    loadedCharacterCount,
    estimatedTokenCount,
    promptCharacterCount: promptSectionCharacterCount,
    promptTokenEstimate: promptSectionTokenEstimate,
    promptPreview: "",
  } satisfies ReviewerCompiledContext;

  const promptPreview = createCompiledReviewerContextPromptSection(Object.freeze(baseCompiledReviewerContext)).body;
  const promptCharacterCount = promptPreview.length;
  const promptTokenEstimate = Math.max(1, Math.ceil(promptCharacterCount / 4));
  const compiledReviewerContext = Object.freeze({
    ...baseCompiledReviewerContext,
    promptCharacterCount,
    promptTokenEstimate,
    promptPreview,
  });

  return Object.freeze({
    registry,
    routing: resolution.routing,
    compiledReviewerContext,
  });
}

export function compileReviewerContext(input: ReviewerCompilerInput): ReviewerCompilerOutput {
  const startedAt = Date.now();
  logger.info("ReviewerCompiler START", {
    subjectModuleId: input.promptInput.subjectModule.id,
    chunkId: input.promptInput.chunkContext.metadata?.chunk_id ?? null,
  });
  const registry = ensureReviewerAcademyRegistry();
  const output = buildCompiledReviewerContext(input, registry);
  const summary = summarizeCompilerOutput(output);
  logger.info("ReviewerCompiler END", {
    subjectModuleId: input.promptInput.subjectModule.id,
    chunkId: input.promptInput.chunkContext.metadata?.chunk_id ?? null,
    loadedDomains: output.routing.selectedAcademyFolders,
    loadedManualCount: output.compiledReviewerContext.loadedManualCount,
    loadedReviewerCount: output.compiledReviewerContext.loadedReviewerCount,
    loadedArticleCount: output.compiledReviewerContext.loadedArticleCount,
    loadedAtomCount: output.compiledReviewerContext.loadedAtomCount,
    compiledCharacterCount: output.compiledReviewerContext.loadedCharacterCount,
    tokenEstimate: output.compiledReviewerContext.promptTokenEstimate,
    promptLengthChars: output.compiledReviewerContext.promptCharacterCount,
    durationMs: Date.now() - startedAt,
    summaryLengthChars: summary.length,
  });
  return output;
}

export function renderReviewerCompilerSection(input: ReviewerCompilerInput): string {
  const output = compileReviewerContext(input);
  return createCompiledReviewerContextPromptSection(output.compiledReviewerContext).body;
}
