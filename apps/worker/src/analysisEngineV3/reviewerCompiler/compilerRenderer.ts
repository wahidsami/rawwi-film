import { joinPromptSections, renderListSection, renderSection, renderStableJsonSection } from "../builder/sectionAssembler.js";
import type { ReviewerCompiledContext, ReviewerAcademyManual, ReviewerCompilerOutput, ReviewerCompilerPromptSection } from "./compilerTypes.js";

function renderManual(manual: ReviewerAcademyManual): string {
  const header = [
    `- folder: ${manual.folder}`,
    `- file: ${manual.fileName}`,
    `- title: ${manual.title}`,
    `- characters: ${manual.characterCount}`,
    `- estimated_tokens: ${manual.estimatedTokenCount}`,
  ].join("\n");

  const sectionBlocks = manual.sections.map((section) =>
    renderSection(section.heading, section.content),
  );

  return renderSection(
    manual.title,
    joinPromptSections([
      renderSection("Manual Metadata", header),
      sectionBlocks.length > 0 ? renderSection("Manual Sections", sectionBlocks.join("\n\n")) : renderSection("Manual Content", manual.content),
    ]),
  );
}

export function renderCompiledReviewerContextSection(context: ReviewerCompiledContext): string {
  return renderSection(
    "Compiled Reviewer Context",
    joinPromptSections([
      renderStableJsonSection("Selection Summary", {
        selected_reviewer_ids: [...context.selection.selectedReviewerIds],
        selected_reviewer_labels: [...context.selection.selectedReviewerLabels],
        selected_academy_folders: [...context.selection.selectedAcademyFolders],
        rejected_reviewer_ids: [...context.selection.rejectedReviewerIds],
        rejected_reviewer_labels: [...context.selection.rejectedReviewerLabels],
        loaded_academy_count: context.selection.loadedAcademyCount,
        skipped_academy_count: context.selection.skippedAcademyCount,
        knowledge_reduction_percent: context.selection.knowledgeReductionPercent,
        routing_confidence: context.selection.routingConfidence,
        routing_reason: context.selection.routingReason,
      }),
      renderStableJsonSection("Registry Summary", {
        academy_root: context.academyRoot,
        fingerprint: context.fingerprint,
        generated_at: context.generatedAt,
        loaded_manual_count: context.loadedManualCount,
        loaded_character_count: context.loadedCharacterCount,
        estimated_token_count: context.estimatedTokenCount,
        prompt_character_count: context.promptCharacterCount,
        prompt_token_estimate: context.promptTokenEstimate,
      }),
      context.universalManuals.length > 0
        ? renderSection("Universal Manuals", context.universalManuals.map((manual) => renderManual(manual)).join("\n\n"))
        : renderSection("Universal Manuals", "- (none)"),
      context.selectedReviewerManuals.length > 0
        ? renderSection("Selected Reviewer Manuals", context.selectedReviewerManuals.map((manual) => renderManual(manual)).join("\n\n"))
        : renderSection("Selected Reviewer Manuals", "- (none)"),
    ]),
  );
}

export function createCompiledReviewerContextPromptSection(context: ReviewerCompiledContext): ReviewerCompilerPromptSection {
  return Object.freeze({
    title: "Compiled Reviewer Context",
    body: renderCompiledReviewerContextSection(context),
  });
}

export function summarizeCompilerOutput(output: ReviewerCompilerOutput): string {
  return renderStableJsonSection("Reviewer Compiler Summary", {
    loaded_manual_count: output.compiledReviewerContext.loadedManualCount,
    estimated_token_count: output.compiledReviewerContext.estimatedTokenCount,
    prompt_character_count: output.compiledReviewerContext.promptCharacterCount,
    prompt_token_estimate: output.compiledReviewerContext.promptTokenEstimate,
    selected_reviewer_ids: [...output.routing.selectedReviewerIds],
    selected_reviewer_labels: [...output.routing.selectedReviewerLabels],
  });
}
