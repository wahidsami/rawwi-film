import type { EmergencyContextualReviewerRoutingReport } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";

export type ReviewerAcademyManualSection = Readonly<{
  heading: string;
  level: number;
  content: string;
}>;

export type ReviewerAcademyManual = Readonly<{
  folder: string;
  fileName: string;
  relativePath: string;
  title: string;
  frontMatter: Readonly<Record<string, string | number | boolean | readonly string[] | null>>;
  sections: readonly ReviewerAcademyManualSection[];
  content: string;
  characterCount: number;
  estimatedTokenCount: number;
  lastModifiedMs: number;
}>;

export type ReviewerAcademyRegistry = Readonly<{
  rootDir: string;
  fingerprint: string;
  loadedAt: string;
  manuals: readonly ReviewerAcademyManual[];
  manualsByFolder: Readonly<Record<string, readonly ReviewerAcademyManual[]>>;
  universalManuals: readonly ReviewerAcademyManual[];
  reviewerFolders: readonly string[];
  fileCount: number;
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
  universalManuals: readonly ReviewerAcademyManual[];
  selectedReviewerManuals: readonly ReviewerAcademyManual[];
  rejectedReviewerManuals: readonly ReviewerAcademyManual[];
  loadedManualCount: number;
  loadedCharacterCount: number;
  estimatedTokenCount: number;
  promptCharacterCount: number;
  promptTokenEstimate: number;
  promptPreview: string;
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
