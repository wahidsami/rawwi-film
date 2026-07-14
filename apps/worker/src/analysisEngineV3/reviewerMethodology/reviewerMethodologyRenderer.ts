import { stableSerializePromptValue } from "../builder/builderContext.js";
import type { V3PromptJsonObject } from "../builder/builderTypes.js";
import { joinPromptSections, renderSection } from "../builder/sectionAssembler.js";
import type { ReviewerAssessment, ReviewerMethodology } from "./reviewerMethodologyTypes.js";

function renderMethodologyValue(methodology: ReviewerMethodology): V3PromptJsonObject {
  return {
    id: methodology.id,
    title: methodology.title,
    purpose: methodology.purpose,
    stages: methodology.stages,
  } as V3PromptJsonObject;
}

function renderAssessmentValue(assessment: ReviewerAssessment): V3PromptJsonObject {
  return {
    applicable_concept_ids: assessment.applicableConceptIds,
    confidence: assessment.confidence,
    concept_confidence: assessment.conceptConfidence,
    concept_count: assessment.conceptCount,
    context_classification: assessment.contextClassification,
    exception_signals: assessment.exceptionSignals,
    literal_vs_implied_meaning: assessment.literalVsImpliedMeaning,
    methodology_id: assessment.methodologyId,
    methodology_title: assessment.methodologyTitle,
    narrative_intent: assessment.narrativeIntent,
    narrative_understanding: assessment.narrativeUnderstanding,
    reasoning_trace: assessment.reasoningTrace,
    speaker: assessment.speaker,
    stage_results: assessment.stageResults,
    target: assessment.target,
    victim: assessment.victim,
    evidence_strength: assessment.evidenceStrength,
  } as V3PromptJsonObject;
}

export function renderReviewerMethodologySection(methodology: ReviewerMethodology, assessment: ReviewerAssessment): string {
  return renderSection(
    "Reviewer Methodology",
    joinPromptSections([
      renderSection("Methodology Definition", stableSerializePromptValue(renderMethodologyValue(methodology))),
      renderSection("Assessment", stableSerializePromptValue(renderAssessmentValue(assessment))),
    ]),
  );
}
