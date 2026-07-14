export type ReviewerQuestionCategory =
  | "Narrative Questions"
  | "Speaker Questions"
  | "Target Questions"
  | "Intent Questions"
  | "Context Questions"
  | "Evidence Questions"
  | "Concept Questions"
  | "Confidence Questions";

export type ReviewerQuestion = Readonly<{
  id: string;
  category: ReviewerQuestionCategory;
  purpose: string;
  expectedAnswerFormat: string;
  reasoningGuidance: string;
  evidenceRequirements: readonly string[];
}>;

export type ReviewerQuestionSet = Readonly<{
  id: string;
  version: string;
  title: string;
  description: string;
  defaultQuestionIds: readonly string[];
  questions: readonly ReviewerQuestion[];
  notes: readonly string[];
}>;

