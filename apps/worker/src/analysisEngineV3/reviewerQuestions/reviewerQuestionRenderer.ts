import { stableSerializePromptValue } from "../builder/builderContext.js";
import type { V3PromptJsonObject } from "../builder/builderTypes.js";
import { joinPromptSections, renderSection } from "../builder/sectionAssembler.js";
import type { ReviewerQuestion, ReviewerQuestionSet } from "./reviewerQuestionTypes.js";

function questionToRenderValue(question: ReviewerQuestion): V3PromptJsonObject {
  return {
    category: question.category,
    evidence_requirements: question.evidenceRequirements,
    expected_answer_format: question.expectedAnswerFormat,
    id: question.id,
    purpose: question.purpose,
    reasoning_guidance: question.reasoningGuidance,
  };
}

function questionSetToRenderValue(questionSet: ReviewerQuestionSet): V3PromptJsonObject {
  return {
    description: questionSet.description,
    default_question_ids: questionSet.defaultQuestionIds,
    id: questionSet.id,
    notes: questionSet.notes,
    title: questionSet.title,
    version: questionSet.version,
    questions: questionSet.questions.map((question) => questionToRenderValue(question)),
  };
}

export function renderReviewerQuestionSetSection(questionSet: ReviewerQuestionSet): string {
  return renderSection(
    "Reviewer Questions",
    joinPromptSections([
      renderSection(questionSet.title, stableSerializePromptValue(questionSetToRenderValue(questionSet))),
    ]),
  );
}

