import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";

export type ReviewerPackVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export type ReviewerPackMetadata = Readonly<{
  id: string;
  version: ReviewerPackVersion;
  title: string;
  description: string;
  supported_concepts: readonly string[];
}>;

export type ReviewerPackManifestEntry = Readonly<{
  folder: string;
  file: string;
  metadata: ReviewerPackMetadata;
  hasPack: boolean;
}>;

export type ReviewerPackManifest = Readonly<{
  schema_version: 1;
  academy_version: ReviewerPackVersion;
  entries: readonly ReviewerPackManifestEntry[];
}>;

export type ReviewerAcademyPackDocument = Readonly<{
  schema_version: 1;
  pack_version: ReviewerPackVersion;
  metadata: ReviewerPackMetadata;
  pack: ReviewerKnowledgePack | null;
}>;

export type ReviewerAcademyIndex = Readonly<{
  rootDir: string;
  manifest: ReviewerPackManifest;
  packs: readonly ReviewerKnowledgePack[];
  metadata: readonly ReviewerPackMetadata[];
  documents: readonly ReviewerAcademyPackDocument[];
}>;
