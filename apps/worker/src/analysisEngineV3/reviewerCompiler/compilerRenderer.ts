import { joinPromptSections, renderListSection, renderSection, renderStableJsonSection } from "../builder/sectionAssembler.js";
import type { V3PromptJsonObject } from "../builder/builderTypes.js";
import type {
  ReviewerAcademyAtom,
  ReviewerAcademyArticle,
  ReviewerAcademyManual,
  ReviewerCompiledContext,
  ReviewerCompiledReviewerPackage,
  ReviewerCompilerOutput,
  ReviewerCompilerPromptSection,
} from "./compilerTypes.js";

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

function renderArticleSummary(article: ReviewerAcademyArticle): V3PromptJsonObject {
  return {
    article_id: article.articleId,
    reviewer: article.reviewer,
    title: article.title,
    protected_interest: article.protectedInterest,
    purpose: article.purpose,
    neighboring_articles: [...article.neighboringArticles],
    atoms: [...article.atoms],
    inherits: [...article.inherits],
    priority: article.priority,
    runtime: article.runtime,
    status: article.status,
  };
}

function renderAtomSummary(atom: ReviewerAcademyAtom): V3PromptJsonObject {
  return {
    atom_id: atom.atomId,
    article_id: atom.articleId,
    reviewer: atom.reviewer,
    title: atom.title,
    protected_interest: atom.protectedInterest,
    inherits: [...atom.inherits],
    priority: atom.priority,
    runtime: atom.runtime,
    status: atom.status,
  };
}

function renderReviewerPackage(reviewerPackage: ReviewerCompiledReviewerPackage): string {
  return renderSection(
    `${reviewerPackage.reviewer} Package`,
    joinPromptSections([
      renderStableJsonSection("Package Summary", {
        reviewer: reviewerPackage.reviewer,
        folder: reviewerPackage.folder,
        loaded_manual_count: reviewerPackage.loadedManualCount,
        loaded_character_count: reviewerPackage.loadedCharacterCount,
        loaded_article_count: reviewerPackage.loadedArticleCount,
        loaded_atom_count: reviewerPackage.loadedAtomCount,
        estimated_token_count: reviewerPackage.estimatedTokenCount,
      }),
      reviewerPackage.manuals.length > 0
        ? renderSection("Reviewer Manuals", reviewerPackage.manuals.map((manual) => renderManual(manual)).join("\n\n"))
        : renderSection("Reviewer Manuals", "- (none)"),
      reviewerPackage.articles.length > 0
        ? renderStableJsonSection("Reviewer Articles", reviewerPackage.articles.map((article) => renderArticleSummary(article)))
        : renderStableJsonSection("Reviewer Articles", []),
      reviewerPackage.atoms.length > 0
        ? renderStableJsonSection("Reviewer Atoms", reviewerPackage.atoms.map((atom) => renderAtomSummary(atom)))
        : renderStableJsonSection("Reviewer Atoms", []),
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
        loaded_reviewer_count: context.loadedReviewerCount,
        loaded_article_count: context.loadedArticleCount,
        loaded_atom_count: context.loadedAtomCount,
        loaded_manual_count: context.loadedManualCount,
        loaded_character_count: context.loadedCharacterCount,
        estimated_token_count: context.estimatedTokenCount,
        prompt_character_count: context.promptCharacterCount,
        prompt_token_estimate: context.promptTokenEstimate,
      }),
      context.universalManuals.length > 0
        ? renderSection("Universal Manuals", context.universalManuals.map((manual) => renderManual(manual)).join("\n\n"))
        : renderSection("Universal Manuals", "- (none)"),
      context.selectedReviewerPackages.length > 0
        ? renderSection("Selected Reviewer Packages", context.selectedReviewerPackages.map((reviewerPackage) => renderReviewerPackage(reviewerPackage)).join("\n\n"))
        : renderSection("Selected Reviewer Packages", "- (none)"),
      context.selectedArticles.length > 0
        ? renderStableJsonSection("Selected Articles", context.selectedArticles.map((article) => renderArticleSummary(article)))
        : renderStableJsonSection("Selected Articles", []),
      context.selectedAtoms.length > 0
        ? renderStableJsonSection("Selected Atoms", context.selectedAtoms.map((atom) => renderAtomSummary(atom)))
        : renderStableJsonSection("Selected Atoms", []),
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
    loaded_reviewer_count: output.compiledReviewerContext.loadedReviewerCount,
    loaded_article_count: output.compiledReviewerContext.loadedArticleCount,
    loaded_atom_count: output.compiledReviewerContext.loadedAtomCount,
    estimated_token_count: output.compiledReviewerContext.estimatedTokenCount,
    prompt_character_count: output.compiledReviewerContext.promptCharacterCount,
    prompt_token_estimate: output.compiledReviewerContext.promptTokenEstimate,
    selected_reviewer_ids: [...output.routing.selectedReviewerIds],
    selected_reviewer_labels: [...output.routing.selectedReviewerLabels],
  });
}
