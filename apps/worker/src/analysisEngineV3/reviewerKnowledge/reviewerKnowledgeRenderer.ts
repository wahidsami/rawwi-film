import { stableSerializePromptValue } from "../builder/builderContext.js";
import type { V3PromptJsonObject } from "../builder/builderTypes.js";
import { joinPromptSections, renderSection } from "../builder/sectionAssembler.js";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";

function packToRenderValue(pack: ReviewerKnowledgePack): V3PromptJsonObject {
  return {
    article_mapping: pack.article_mapping,
    common_false_positives: pack.common_false_positives,
    default_question_set_id: pack.default_question_set_id ?? null,
    glossary_relationships: pack.glossary_relationships,
    id: pack.id,
    legal_exceptions: pack.legal_exceptions,
    module_id: pack.module_id,
    negative_examples: pack.negative_examples,
    positive_examples: pack.positive_examples,
    protected_concepts: pack.protected_concepts,
    protected_interests: pack.protected_interests,
    purpose: pack.purpose,
    reporting_guidance: pack.reporting_guidance,
    required_evidence: pack.required_evidence,
    reviewer_heuristics: pack.reviewer_heuristics,
    title: pack.title,
    trigger_concept_ids: pack.trigger_concept_ids,
    insufficient_evidence: pack.insufficient_evidence,
  };
}

export function renderReviewerKnowledgePacksSection(packs: readonly ReviewerKnowledgePack[]): string {
  if (packs.length === 0) {
    return renderSection("Reviewer Knowledge Packs", "- (none)");
  }

  const renderedPacks = packs.map((pack) => `### ${pack.title}\n${stableSerializePromptValue(packToRenderValue(pack))}`);
  return renderSection("Reviewer Knowledge Packs", joinPromptSections(renderedPacks));
}
