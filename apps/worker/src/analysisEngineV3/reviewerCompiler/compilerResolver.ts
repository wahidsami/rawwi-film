import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import {
  createEmergencyContextualReviewerRoutingReport,
  type EmergencyContextualReviewerRoutingReport,
} from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";

export type ReviewerCompilerResolverInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>;

export type ReviewerCompilerResolution = Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  selectedFolders: readonly string[];
}>;

export function resolveReviewerCompilerSelection(input: ReviewerCompilerResolverInput): ReviewerCompilerResolution {
  const routing = createEmergencyContextualReviewerRoutingReport(input);
  return Object.freeze({
    routing,
    selectedFolders: routing.selectedAcademyFolders,
  });
}

