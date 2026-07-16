import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import { logger } from "../../logger.js";
import { ensureReviewerAcademyRegistry } from "./compilerLoader.js";
import { resolveReviewerCompilerSelection } from "./compilerResolver.js";
import { createCompiledReviewerContextPromptSection, summarizeCompilerOutput } from "./compilerRenderer.js";
import type { ReviewerCompiledContext, ReviewerCompilerOutput, ReviewerAcademyManual } from "./compilerTypes.js";

export type ReviewerCompilerInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>;

function normalizeFolderName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function selectManualsByFolder(manualsByFolder: Readonly<Record<string, readonly ReviewerAcademyManual[]>>, folders: readonly string[]): readonly ReviewerAcademyManual[] {
  const selected = folders.flatMap((folder) => manualsByFolder[normalizeFolderName(folder)] ?? []);
  return Object.freeze(selected.slice().sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
}

function buildCompiledReviewerContext(input: ReviewerCompilerInput, registry: ReturnType<typeof ensureReviewerAcademyRegistry>): ReviewerCompilerOutput {
  const resolution = resolveReviewerCompilerSelection({
    promptInput: input.promptInput,
    conceptContext: input.conceptContext,
    assessment: input.assessment,
  });

  const universalManuals = Object.freeze([...(registry.universalManuals ?? [])]);
  const selectedReviewerManuals = selectManualsByFolder(registry.manualsByFolder, resolution.selectedFolders.filter((folder) => normalizeFolderName(folder) !== "universal"));
  const rejectedReviewerManuals = Object.freeze(
    registry.reviewerFolders
      .filter((folder) => !resolution.selectedFolders.some((selectedFolder) => normalizeFolderName(selectedFolder) === normalizeFolderName(folder)))
      .flatMap((folder) => registry.manualsByFolder[folder] ?? []),
  );
  const loadedManuals = Object.freeze([...universalManuals, ...selectedReviewerManuals]);
  const loadedCharacterCount = loadedManuals.reduce((total, manual) => total + manual.characterCount, 0);
  const estimatedTokenCount = loadedManuals.reduce((total, manual) => total + manual.estimatedTokenCount, 0);
  const manualPromptCharacterCount = loadedManuals.reduce((total, manual) => total + manual.content.length + manual.title.length, 0);
  const manualPromptTokenEstimate = Math.max(1, Math.ceil(manualPromptCharacterCount / 4));

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
    loadedManualCount: loadedManuals.length,
    loadedCharacterCount,
    estimatedTokenCount,
    promptCharacterCount: manualPromptCharacterCount,
    promptTokenEstimate: manualPromptTokenEstimate,
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
