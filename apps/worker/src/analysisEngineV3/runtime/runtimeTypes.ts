import type { PromptLexiconTerm } from "../../jobAnalysisCache.js";
import type { AnalysisExecutionSignatureInput } from "../../executionSignature.js";
import type { V3PromptOutputSchema, V3PromptSubjectModule } from "../builder/builderTypes.js";
import type { AnalysisResponse } from "../engine/analysisResponse.js";
import type { V3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import type { JudgeFinding } from "../../schemas.js";
import type { V3ProviderName } from "../provider/providerTypes.js";

export type V3RuntimeFinding = Omit<JudgeFinding, "source" | "evidence_hash" | "canonical_hash" | "lineage_id" | "parent_lineage_id" | "related_article_ids"> & Readonly<{
  source?: string | null;
  category?: string | null;
  start_offset_global: number;
  end_offset_global: number;
  exists?: boolean;
  exceptionApplied?: boolean;
  exceptionType?: string | null;
  exceptionReason?: string | null;
  recommendedAction?: "Approve" | "Reject" | "Needs Review" | null;
  legalRecommendation?: "Approve" | "Reject" | "Needs Review" | null;
  lineage_id?: string | null;
  parent_lineage_id?: string | null;
  canonical_hash?: string | null;
  evidence_hash?: string | null;
  policy_links?: ReadonlyArray<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
  primary_article_id?: number | null;
  related_article_ids?: readonly number[];
  canonical_finding_id?: string | null;
  pillar_id?: string | null;
  secondary_pillar_ids?: readonly string[];
}>;

export type V3RuntimeAdapterRequest = Readonly<{
  jobId: string;
  chunkId: string;
  scriptId: string;
  versionId: string;
  chunkText: string;
  chunkStart: number;
  chunkEnd: number;
  chunkIndex: number;
  startLine: number | null;
  endLine: number | null;
  storyMemory: string | null;
  sceneMemory: string | null;
  neighboringSentences: readonly string[];
  analysisPromptContext: string | null;
  promptLexiconTerms: readonly PromptLexiconTerm[];
  analysisSignatureContext?: AnalysisExecutionSignatureInput | null;
  diagnosticsEnabled?: boolean;
}>;

export type V3RuntimeAdapterOptions = Readonly<{
  providerName?: V3ProviderName;
  modelName?: string;
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  subjectModule?: V3PromptSubjectModule;
  outputSchema?: V3PromptOutputSchema;
  policySelectedArticleIds?: readonly number[];
}>;

export type V3RuntimeAdapterResult = Readonly<{
  analysisResponse: AnalysisResponse;
  findings: readonly V3RuntimeFinding[];
  diagnostics: V3RuntimeDiagnostics;
  truthLayerMeta: Record<string, unknown>;
}>;
