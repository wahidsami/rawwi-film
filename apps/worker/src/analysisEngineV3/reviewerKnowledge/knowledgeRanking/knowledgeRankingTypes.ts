import type { AnalysisRequest } from "../../engine/analysisRequest.js";
import type { AnalysisResponse } from "../../engine/analysisResponse.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryReport } from "../knowledgeRegistry/knowledgeRegistryTypes.js";
import type { V3PromptSubjectModule } from "../../builder/builderTypes.js";

export type KnowledgeRankingKind =
  | "domain"
  | "concept"
  | "lesson"
  | "blueprint"
  | "pattern"
  | "relationship"
  | "article";

export type KnowledgeRankingItem = Readonly<{
  id: string;
  label: string;
  kind: KnowledgeRankingKind;
  score: number;
  confidence: number;
  reasons: readonly string[];
  registryKeys: readonly string[];
  conceptIds: readonly string[];
  articleIds: readonly number[];
  relatedIds: readonly string[];
  domain: string | null;
}>;

export type KnowledgeRankingQuery = Readonly<{
  jobId: string;
  chunkId: string;
  analysisEngine: string;
  pipelineVersion: string;
  chunkText: string;
  analysisPromptContext: string | null;
  storyMemory: string | null;
  sceneMemory: string | null;
  neighboringSentences: readonly string[];
  subjectModule: V3PromptSubjectModule;
  analysisRequest: AnalysisRequest;
  analysisResponse: AnalysisResponse;
  registry: KnowledgeRegistryReport;
}>;

export type KnowledgeRankingReport = Readonly<{
  jobId: string;
  chunkId: string;
  analysisEngine: string;
  pipelineVersion: string;
  querySummary: Readonly<{
    subjectModuleId: string;
    subjectModuleTitle: string;
    conceptIds: readonly string[];
    articleIds: readonly number[];
    semanticConfidence: number;
    evidenceConfidence: number;
    queryTerms: readonly string[];
  }>;
  domainScores: readonly KnowledgeRankingItem[];
  conceptScores: readonly KnowledgeRankingItem[];
  lessonScores: readonly KnowledgeRankingItem[];
  blueprintScores: readonly KnowledgeRankingItem[];
  patternScores: readonly KnowledgeRankingItem[];
  relationshipScores: readonly KnowledgeRankingItem[];
  articleScores: readonly KnowledgeRankingItem[];
  selectedRegistryKeys: readonly string[];
  knowledgeConfidence: number;
  retrievalCoverage: number;
  totalRegistryEntries: number;
}>;

