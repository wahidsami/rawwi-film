import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import type { ReviewerCandidateSelectionDiagnostics } from "../ranking/rankingTypes.js";
import type { V3PromptJsonValue } from "../builder/builderTypes.js";

export type ReviewerAcademyManualSection = Readonly<{
  heading: string;
  level: number;
  content: string;
}>;

export type ReviewerAcademyFrontMatterValue = string | number | boolean | readonly string[] | null;

export type ReviewerAcademyManual = Readonly<{
  folder: string;
  fileName: string;
  relativePath: string;
  title: string;
  frontMatter: Readonly<Record<string, ReviewerAcademyFrontMatterValue>>;
  sections: readonly ReviewerAcademyManualSection[];
  content: string;
  characterCount: number;
  estimatedTokenCount: number;
  lastModifiedMs: number;
}>;

export type ReviewerAcademyArticle = Readonly<{
  articleId: string;
  reviewer: string;
  title: string;
  protectedInterest: string;
  purpose: string;
  neighboringArticles: readonly string[];
  atoms: readonly string[];
  inherits: readonly string[];
  priority: number | null;
  runtime: boolean | null;
  retrieval: Readonly<Record<string, V3PromptJsonValue>> | null;
  status: string | null;
  sourcePath: string;
}>;

export type ReviewerAcademyArticleDocument = Readonly<{
  articleId: string;
  reviewer: string;
  title: string;
  version: string;
  status: string;
  sections: readonly ReviewerAcademyManualSection[];
  content: string;
  characterCount: number;
  estimatedTokenCount: number;
  sourcePath: string;
}>;

export type ReviewerAcademyAtom = Readonly<{
  atomId: string;
  articleId: string;
  reviewer: string;
  title: string;
  protectedInterest: string;
  inherits: readonly string[];
  priority: number | null;
  runtime: boolean | null;
  retrieval: Readonly<Record<string, V3PromptJsonValue>> | null;
  status: string | null;
  sourcePath: string;
}>;

export type ReviewerAcademyRelationshipArticle = Readonly<{
  atoms: readonly string[];
}>;

export type ReviewerAcademyRelationshipReviewer = Readonly<{
  articles: Readonly<Record<string, ReviewerAcademyRelationshipArticle>>;
}>;

export type ReviewerAcademyRelationshipMap = Readonly<{
  reviewers: Readonly<Record<string, ReviewerAcademyRelationshipReviewer>>;
}>;

export type ReviewerAcademyRegistry = Readonly<{
  rootDir: string;
  fingerprint: string;
  loadedAt: string;
  manuals: readonly ReviewerAcademyManual[];
  manualsByFolder: Readonly<Record<string, readonly ReviewerAcademyManual[]>>;
  universalManuals: readonly ReviewerAcademyManual[];
  reviewerFolders: readonly string[];
  articlesById: Readonly<Record<string, ReviewerAcademyArticle>>;
  atomsById: Readonly<Record<string, ReviewerAcademyAtom>>;
  articlesByReviewer: Readonly<Record<string, readonly ReviewerAcademyArticle[]>>;
  atomsByArticle: Readonly<Record<string, readonly ReviewerAcademyAtom[]>>;
  relationshipMap: ReviewerAcademyRelationshipMap;
  documents: readonly ReviewerAcademyManual[];
  referenceDocuments: readonly ReviewerAcademyManual[];
  fileCount: number;
  markdownCount: number;
  metadataCount: number;
  articleCount: number;
  atomCount: number;
  characterCount: number;
  estimatedTokenCount: number;
}>;

export type ReviewerCompilerSelection = Readonly<{
  selectedReviewerIds: readonly string[];
  selectedReviewerLabels: readonly string[];
  selectedAcademyFolders: readonly string[];
  rejectedReviewerIds: readonly string[];
  rejectedReviewerLabels: readonly string[];
  loadedAcademyCount: number;
  skippedAcademyCount: number;
  knowledgeReductionPercent: number;
  routingConfidence: number;
  routingReason: string;
  lowConfidence: boolean;
  reviewerScores: EmergencyContextualReviewerRoutingReport["reviewerScores"];
}>;

export type ReviewerCompiledContext = Readonly<{
  academyRoot: string;
  fingerprint: string;
  generatedAt: string;
  selection: ReviewerCompilerSelection;
  knowledgeRegistrySummary?: ReviewerCompiledKnowledgeRegistrySummary | null;
  universalManuals: readonly ReviewerAcademyManual[];
  selectedReviewerManuals: readonly ReviewerAcademyManual[];
  rejectedReviewerManuals: readonly ReviewerAcademyManual[];
  selectedReviewerPackages: readonly ReviewerCompiledReviewerPackage[];
  selectedArticles: readonly ReviewerAcademyArticle[];
  selectedAtoms: readonly ReviewerAcademyAtom[];
  selectedPolicyArticleIds?: readonly number[];
  selectedPolicyAtomIds?: readonly string[];
  loadedManualCount: number;
  loadedReviewerCount: number;
  loadedArticleCount: number;
  loadedAtomCount: number;
  loadedCharacterCount: number;
  estimatedTokenCount: number;
  promptCharacterCount: number;
  promptTokenEstimate: number;
  promptPreview: string;
  candidateDiagnostics?: ReviewerCandidateSelectionDiagnostics | null;
}>;

export type ReviewerCompiledKnowledgeRegistrySummary = Readonly<{
  rootDir: string;
  fingerprint: string;
  loadedAt: string;
  fileCount: number;
  markdownCount: number;
  knowledgeDomainCount: number;
  characterCount: number;
  estimatedTokenCount: number;
  knowledgeDomains: readonly string[];
}>;

export type ReviewerCompiledReviewerPackage = Readonly<{
  reviewer: string;
  folder: string;
  manuals: readonly ReviewerAcademyManual[];
  articles: readonly ReviewerAcademyArticle[];
  atoms: readonly ReviewerAcademyAtom[];
  loadedManualCount: number;
  loadedCharacterCount: number;
  loadedArticleCount: number;
  loadedAtomCount: number;
  estimatedTokenCount: number;
}>;

export type ReviewerCompilerOutput = Readonly<{
  registry: ReviewerAcademyRegistry;
  routing: EmergencyContextualReviewerRoutingReport;
  compiledReviewerContext: ReviewerCompiledContext;
}>;

export type ReviewerCompilerPromptSection = Readonly<{
  title: string;
  body: string;
}>;
