import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";

export type ReviewerMethodologyStageName =
  | "narrative_understanding"
  | "speaker_identification"
  | "target_identification"
  | "victim_identification"
  | "narrative_intent"
  | "evidence_strength"
  | "context_classification"
  | "literal_vs_implied_meaning"
  | "exception_detection"
  | "confidence_assessment"
  | "applicable_concept_validation";

export type ReviewerMethodologyStage = Readonly<{
  name: ReviewerMethodologyStageName;
  title: string;
  purpose: string;
  inputs: readonly string[];
  outputs: readonly string[];
}>;

export type ReviewerMethodology = Readonly<{
  id: string;
  title: string;
  purpose: string;
  stages: readonly ReviewerMethodologyStage[];
}>;

export type ReviewerMethodologyStageResult = Readonly<{
  name: ReviewerMethodologyStageName;
  title: string;
  purpose: string;
  status: "complete" | "partial" | "uncertain";
  summary: string;
  confidence: number;
  inputs: readonly string[];
  outputs: readonly string[];
  notes: readonly string[];
}>;

export type ReviewerAssessment = Readonly<{
  methodologyId: string;
  methodologyTitle: string;
  narrativeUnderstanding: string;
  speaker: string | null;
  target: string | null;
  victim: string | null;
  narrativeIntent: string;
  evidenceStrength: number;
  contextClassification: string;
  literalVsImpliedMeaning: string;
  exceptionSignals: readonly string[];
  confidence: number;
  applicableConceptIds: readonly string[];
  conceptConfidence: number;
  conceptCount: number;
  reasoningTrace: readonly string[];
  stageResults: readonly ReviewerMethodologyStageResult[];
}>;

export type ReviewerMethodologyValidationIssue = Readonly<{
  path: string;
  message: string;
}>;

export type ReviewerMethodologyValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ReviewerMethodologyValidationIssue[];
}>;

export type ReviewerMethodologyRunnerInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
}>;

