import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { createDefaultReviewerKnowledgeRegistry, ReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";
import { createReviewerKnowledgeRetrievalReport } from "./reviewerKnowledgeRetrieval.js";

export function selectReviewerKnowledgePacks(
  assessment: ReviewerAssessment,
  conceptContext: ConceptContext,
  registry: ReviewerKnowledgeRegistry = createDefaultReviewerKnowledgeRegistry(),
  subjectModule?: V3PromptSubjectModule | null,
): readonly ReviewerKnowledgePack[] {
  return createReviewerKnowledgeRetrievalReport({
    assessment,
    conceptContext,
    registry,
    subjectModule: subjectModule ?? null,
  }).selectedPacks;
}
