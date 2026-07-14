import { z } from "zod";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { importReviewerKnowledgeDocument, parseReviewerKnowledgeDocumentText } from "../reviewerKnowledgeIO.js";
import { normalizeReviewerKnowledgePack } from "../reviewerKnowledgeNormalization.js";
import type {
  ReviewerAcademyIndex,
  ReviewerAcademyPackDocument,
  ReviewerPackManifest,
  ReviewerPackManifestEntry,
  ReviewerPackMetadata,
  ReviewerPackVersion,
} from "./reviewerAcademyTypes.js";

const ReviewerPackVersionSchema = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
}).strict();

const ReviewerPackMetadataSchema: z.ZodType<ReviewerPackMetadata> = z.object({
  id: z.string().trim().min(1),
  version: ReviewerPackVersionSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  supported_concepts: z.array(z.string().trim().min(1)),
}).strict();

const ReviewerAcademyPackDocumentSchema = z.object({
  schema_version: z.literal(1),
  pack_version: ReviewerPackVersionSchema,
  metadata: ReviewerPackMetadataSchema,
  pack: z.union([z.any(), z.null()]),
}).strict();

function normalizeVersion(version: ReviewerPackVersion): ReviewerPackVersion {
  return Object.freeze({
    major: version.major,
    minor: version.minor,
    patch: version.patch,
  });
}

function compareVersion(left: ReviewerPackVersion, right: ReviewerPackVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function compareMetadata(left: ReviewerPackMetadata, right: ReviewerPackMetadata): number {
  return left.id.localeCompare(right.id) || compareVersion(left.version, right.version) || left.title.localeCompare(right.title);
}

export function normalizeReviewerPackMetadata(metadata: ReviewerPackMetadata): ReviewerPackMetadata {
  return Object.freeze({
    id: metadata.id.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase(),
    version: normalizeVersion(metadata.version),
    title: metadata.title.normalize("NFC").replace(/\s+/g, " ").trim(),
    description: metadata.description.normalize("NFC").replace(/\s+/g, " ").trim(),
    supported_concepts: Object.freeze([...new Set(metadata.supported_concepts.map((value) => value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean))].sort((left, right) => left.localeCompare(right))),
  });
}

export function createReviewerPackManifestEntry(folder: string, file: string, metadata: ReviewerPackMetadata, hasPack: boolean): ReviewerPackManifestEntry {
  return Object.freeze({
    folder,
    file,
    metadata: normalizeReviewerPackMetadata(metadata),
    hasPack,
  });
}

export function createReviewerPackManifest(entries: readonly ReviewerPackManifestEntry[], academyVersion: ReviewerPackVersion = { major: 1, minor: 0, patch: 0 }): ReviewerPackManifest {
  return Object.freeze({
    schema_version: 1,
    academy_version: normalizeVersion(academyVersion),
    entries: Object.freeze([...entries].sort((left, right) => compareMetadata(left.metadata, right.metadata))),
  });
}

export function normalizeReviewerAcademyPackDocument(document: ReviewerAcademyPackDocument): ReviewerAcademyPackDocument {
  const parsed = ReviewerAcademyPackDocumentSchema.parse(document);
  return Object.freeze({
    schema_version: 1,
    pack_version: normalizeVersion(parsed.pack_version),
    metadata: normalizeReviewerPackMetadata(parsed.metadata),
    pack: parsed.pack === null ? null : normalizeReviewerKnowledgePack(parsed.pack as ReviewerKnowledgePack),
  });
}

export function createReviewerAcademyIndex(rootDir: string, documents: readonly ReviewerAcademyPackDocument[]): ReviewerAcademyIndex {
  const normalizedDocuments = Object.freeze(documents.map((document) => normalizeReviewerAcademyPackDocument(document)).sort((left, right) => compareMetadata(left.metadata, right.metadata)));
  const packs = Object.freeze(normalizedDocuments.filter((document): document is ReviewerAcademyPackDocument & { pack: ReviewerKnowledgePack } => document.pack !== null).map((document) => document.pack));
  const metadata = Object.freeze(normalizedDocuments.map((document) => document.metadata));
  const manifest = createReviewerPackManifest(
    normalizedDocuments.map((document) => createReviewerPackManifestEntry(
      document.metadata.id,
      "pack.v1.json",
      document.metadata,
      document.pack !== null,
    )),
  );

  return Object.freeze({
    rootDir,
    manifest,
    packs,
    metadata,
    documents: normalizedDocuments,
  });
}

export function parseReviewerAcademyPackDocumentText(text: string): ReviewerAcademyPackDocument {
  const parsed = parseReviewerKnowledgeDocumentText(text);
  const result = ReviewerAcademyPackDocumentSchema.parse(parsed);
  return Object.freeze({
    schema_version: result.schema_version,
    pack_version: normalizeVersion(result.pack_version),
    metadata: normalizeReviewerPackMetadata(result.metadata),
    pack: result.pack === null ? null : normalizeReviewerKnowledgePack(result.pack as ReviewerKnowledgePack),
  });
}
