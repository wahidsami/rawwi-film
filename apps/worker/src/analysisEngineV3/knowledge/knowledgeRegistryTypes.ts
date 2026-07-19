export type KnowledgeReviewType = "Reasoning" | "Verification" | "Hybrid";

export type KnowledgePrimaryEvidence = "Dialogue" | "SceneDescription" | "StoryContext";

export type KnowledgeRegistryMetadataSource = "frontmatter" | "inferred";

export type KnowledgeDocumentMetadata = Readonly<{
  knowledgeDomain: string;
  reviewType: KnowledgeReviewType;
  primaryEvidence: KnowledgePrimaryEvidence;
  articleReference: number | null;
  fileName: string;
  sourcePath: string;
  title: string;
  metadataSource: KnowledgeRegistryMetadataSource;
}>;

export type KnowledgeDocument = Readonly<{
  metadata: KnowledgeDocumentMetadata;
  content: string;
  characterCount: number;
  estimatedTokenCount: number;
  lastModifiedMs: number;
}>;

export type KnowledgeRegistry = Readonly<{
  rootDir: string;
  loadedAt: string;
  fingerprint: string;
  documents: readonly KnowledgeDocument[];
  documentsByDomain: Readonly<Record<string, readonly KnowledgeDocument[]>>;
  filesByDomain: Readonly<Record<string, readonly string[]>>;
  fileCount: number;
  markdownCount: number;
  knowledgeDomainCount: number;
  characterCount: number;
  estimatedTokenCount: number;
}>;
