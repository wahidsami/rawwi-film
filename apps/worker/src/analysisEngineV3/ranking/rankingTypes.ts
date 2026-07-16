import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";

export type ReviewerRankingBaseInput = Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
  selectedReviewerIds: readonly string[];
  selectedReviewerFolders: readonly string[];
  queryTerms: readonly string[];
}>;

export type ReviewerArticleRankingItem = Readonly<{
  articleId: string;
  policyArticleId: number;
  reviewer: string;
  articleNumber: number | null;
  policyTitle: string | null;
  score: number;
  confidence: number;
  reasons: readonly string[];
  matchedTerms: readonly string[];
  selected: boolean;
  sourcePath: string;
  priority: number | null;
  runtime: boolean | null;
  retrievalEnabled: boolean;
  atomCount: number;
}>;

export type ReviewerAtomRankingItem = Readonly<{
  atomId: string;
  articleId: string;
  policyArticleId: number;
  reviewer: string;
  articleNumber: number | null;
  policyAtomId: string | null;
  policyAtomTitle: string | null;
  canonicalAtoms: readonly string[];
  score: number;
  confidence: number;
  reasons: readonly string[];
  matchedTerms: readonly string[];
  selected: boolean;
  sourcePath: string;
  priority: number | null;
  runtime: boolean | null;
  retrievalEnabled: boolean;
}>;

export type ReviewerArticleRankingReport = Readonly<{
  enabled: boolean;
  selectedReviewerIds: readonly string[];
  selectedReviewerFolders: readonly string[];
  queryTerms: readonly string[];
  articleScores: readonly ReviewerArticleRankingItem[];
  selectedArticleIdsByReviewer: Readonly<Record<string, readonly string[]>>;
  selectedPolicyArticleIdsByReviewer: Readonly<Record<string, readonly number[]>>;
  selectedArticleIds: readonly string[];
  selectedPolicyArticleIds: readonly number[];
  selectedArticleCount: number;
  rejectedArticleCount: number;
  articleReductionPercent: number;
  limitPerReviewer: number;
}>;

export type ReviewerAtomRankingReport = Readonly<{
  enabled: boolean;
  selectedReviewerIds: readonly string[];
  selectedReviewerFolders: readonly string[];
  queryTerms: readonly string[];
  atomScores: readonly ReviewerAtomRankingItem[];
  selectedAtomIdsByArticle: Readonly<Record<string, readonly string[]>>;
  selectedPolicyAtomIdsByArticle: Readonly<Record<string, readonly string[]>>;
  selectedAtomIds: readonly string[];
  selectedPolicyAtomIds: readonly string[];
  selectedAtomCount: number;
  rejectedAtomCount: number;
  atomReductionPercent: number;
  limitPerArticle: number;
}>;

export type ReviewerRankingDiagnostics = Readonly<{
  enabled: boolean;
  selectedReviewerIds: readonly string[];
  selectedReviewerFolders: readonly string[];
  selectedReviewerCount: number;
  selectedArticleCount: number;
  rejectedArticleCount: number;
  selectedAtomCount: number;
  rejectedAtomCount: number;
  articleReductionPercent: number;
  atomReductionPercent: number;
  selectedArticleIdsByReviewer: Readonly<Record<string, readonly string[]>>;
  selectedAtomIdsByArticle: Readonly<Record<string, readonly string[]>>;
  topArticleScores: readonly ReviewerArticleRankingItem[];
  topAtomScores: readonly ReviewerAtomRankingItem[];
}>;

export type ReviewerCandidateSelectionDiagnostics = Readonly<{
  enabled: boolean;
  routing: EmergencyContextualReviewerRoutingReport;
  resolvedReviewerFolders: readonly string[];
  selectedReviewerIds: readonly string[];
  selectedReviewerLabels: readonly string[];
  rejectedReviewerIds: readonly string[];
  rejectedReviewerLabels: readonly string[];
  reviewerScores: EmergencyContextualReviewerRoutingReport["reviewerScores"];
  articleRanking: ReviewerArticleRankingReport;
  atomRanking: ReviewerAtomRankingReport;
  legacyArticleCount: number;
  legacyAtomCount: number;
  selectedArticleCount: number;
  selectedAtomCount: number;
  articleReductionPercent: number;
  atomReductionPercent: number;
  legacyPromptCharacterCount: number;
  candidatePromptCharacterCount: number;
  promptReductionPercent: number;
  finalAcceptedCandidate: Readonly<{
    articleId: string;
    policyArticleId: number;
    atomId: string | null;
    policyAtomId: string | null;
    reviewer: string;
    title: string;
  }> | null;
}>;
