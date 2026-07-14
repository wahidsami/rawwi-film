import { createHash } from "node:crypto";
import { z } from "zod";

import { parseReviewerKnowledgeDocumentText } from "../../reviewerKnowledgeIO.js";
import {
  normalizeKnowledgeAcquisitionText,
} from "./knowledgeAcquisitionVersioning.js";
import type {
  KnowledgeAcquisitionBundleDocument,
  KnowledgeAcquisitionDocumentInput,
  KnowledgeAcquisitionKnowledgeType,
  KnowledgeAcquisitionRecord,
  KnowledgeAcquisitionRecordDocument,
} from "./knowledgeAcquisitionTypes.js";

const NonEmptyString = z.string().refine((value) => normalizeKnowledgeAcquisitionText(value).length > 0, {
  message: "must be a non-empty string",
});

const OptionalNonEmptyString = z.union([z.null(), NonEmptyString]).optional().transform((value) => value ?? null);

const StringList = z.array(NonEmptyString);

const KnowledgeAcquisitionRecordSchema: z.ZodType<KnowledgeAcquisitionRecord, z.ZodTypeDef, any> = z.object({
  id: NonEmptyString,
  version: NonEmptyString,
  source: NonEmptyString,
  date: NonEmptyString,
  reviewerConfidence: z.number().finite(),
  knowledgeType: NonEmptyString,
  domain: NonEmptyString,
  concepts: StringList,
  storyContext: NonEmptyString,
  evidence: StringList,
  reasoning: StringList,
  decision: NonEmptyString,
  alternativeDecisions: StringList,
  rejectedInterpretations: StringList,
  relatedLessons: StringList,
  relatedPatterns: StringList,
  relatedDecisionRecords: StringList,
  relatedBenchmarks: StringList,
  knowledgeDebtReference: NonEmptyString,
  futureReviewNotes: StringList,
  reviewerId: OptionalNonEmptyString,
  reviewerName: OptionalNonEmptyString,
  agreementState: z.enum(["consensus", "disagreement", "pending"]),
  disagreementGroupId: OptionalNonEmptyString,
  supersedesId: OptionalNonEmptyString,
  supersededById: OptionalNonEmptyString,
  relatedRecordIds: StringList,
}).strict();

const KnowledgeAcquisitionRecordDocumentSchema: z.ZodType<KnowledgeAcquisitionRecordDocument, z.ZodTypeDef, any> = z.object({
  schema_version: z.literal(1),
  document_version: NonEmptyString,
  format: z.literal("knowledge_acquisition_record").optional(),
  record: KnowledgeAcquisitionRecordSchema,
}).strict();

const KnowledgeAcquisitionBundleDocumentSchema: z.ZodType<KnowledgeAcquisitionBundleDocument, z.ZodTypeDef, any> = z.object({
  schema_version: z.literal(1),
  bundle_version: NonEmptyString,
  format: z.literal("knowledge_acquisition_bundle").optional(),
  records: z.array(KnowledgeAcquisitionRecordDocumentSchema),
}).strict();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = canonicalize(record[key]);
    }
    return canonical;
  }

  return value;
}

export function stableSerializeKnowledgeAcquisitionValue(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function hashKnowledgeAcquisitionValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeKnowledgeAcquisitionValue(value), "utf8").digest("hex");
}

function toStringList(values: readonly string[]): readonly string[] {
  const normalized = values.map((value) => normalizeKnowledgeAcquisitionText(value)).filter((value) => value.length > 0);
  return Object.freeze([...new Set(normalized)].sort((left, right) => left.localeCompare(right)));
}

export function normalizeKnowledgeAcquisitionRecord(record: KnowledgeAcquisitionRecord): KnowledgeAcquisitionRecord {
  const normalized = KnowledgeAcquisitionRecordSchema.parse({
    ...record,
    id: normalizeKnowledgeAcquisitionText(record.id),
    version: normalizeKnowledgeAcquisitionText(record.version),
    source: normalizeKnowledgeAcquisitionText(record.source),
    date: normalizeKnowledgeAcquisitionText(record.date),
    knowledgeType: normalizeKnowledgeAcquisitionText(record.knowledgeType) as KnowledgeAcquisitionKnowledgeType,
    domain: normalizeKnowledgeAcquisitionText(record.domain),
    concepts: toStringList(record.concepts),
    storyContext: normalizeKnowledgeAcquisitionText(record.storyContext),
    evidence: toStringList(record.evidence),
    reasoning: toStringList(record.reasoning),
    decision: normalizeKnowledgeAcquisitionText(record.decision),
    alternativeDecisions: toStringList(record.alternativeDecisions),
    rejectedInterpretations: toStringList(record.rejectedInterpretations),
    relatedLessons: toStringList(record.relatedLessons),
    relatedPatterns: toStringList(record.relatedPatterns),
    relatedDecisionRecords: toStringList(record.relatedDecisionRecords),
    relatedBenchmarks: toStringList(record.relatedBenchmarks),
    knowledgeDebtReference: normalizeKnowledgeAcquisitionText(record.knowledgeDebtReference),
    futureReviewNotes: toStringList(record.futureReviewNotes),
    reviewerId: record.reviewerId === null ? null : record.reviewerId === undefined ? null : normalizeKnowledgeAcquisitionText(record.reviewerId),
    reviewerName: record.reviewerName === null ? null : record.reviewerName === undefined ? null : normalizeKnowledgeAcquisitionText(record.reviewerName),
    disagreementGroupId: record.disagreementGroupId === null ? null : record.disagreementGroupId === undefined ? null : normalizeKnowledgeAcquisitionText(record.disagreementGroupId),
    supersedesId: record.supersedesId === null ? null : record.supersedesId === undefined ? null : normalizeKnowledgeAcquisitionText(record.supersedesId),
    supersededById: record.supersededById === null ? null : record.supersededById === undefined ? null : normalizeKnowledgeAcquisitionText(record.supersededById),
    relatedRecordIds: toStringList(record.relatedRecordIds),
  });

  return Object.freeze({
    ...normalized,
    reviewerConfidence: Number(normalized.reviewerConfidence.toFixed(6)),
  });
}

function normalizeDocumentRecord(document: KnowledgeAcquisitionRecordDocument): KnowledgeAcquisitionRecordDocument {
  return Object.freeze({
    schema_version: 1 as const,
    document_version: normalizeKnowledgeAcquisitionText(document.document_version),
    format: document.format ?? "knowledge_acquisition_record",
    record: normalizeKnowledgeAcquisitionRecord(document.record),
  });
}

export function createKnowledgeAcquisitionRecordDocument(
  record: KnowledgeAcquisitionRecord,
  documentVersion = "1.0.0",
): KnowledgeAcquisitionRecordDocument {
  return normalizeDocumentRecord(Object.freeze({
    schema_version: 1,
    document_version: documentVersion,
    format: "knowledge_acquisition_record",
    record,
  }));
}

export function createKnowledgeAcquisitionBundleDocument(
  records: readonly KnowledgeAcquisitionRecord[],
  bundleVersion = "1.0.0",
  documentVersion = "1.0.0",
): KnowledgeAcquisitionBundleDocument {
  return Object.freeze({
    schema_version: 1 as const,
    bundle_version: normalizeKnowledgeAcquisitionText(bundleVersion),
    format: "knowledge_acquisition_bundle" as const,
    records: Object.freeze(records.map((record) => createKnowledgeAcquisitionRecordDocument(record, documentVersion))),
  });
}

export function parseKnowledgeAcquisitionRecord(input: unknown): KnowledgeAcquisitionRecord {
  return normalizeKnowledgeAcquisitionRecord(KnowledgeAcquisitionRecordSchema.parse(input));
}

export function parseKnowledgeAcquisitionDocument(input: unknown): readonly KnowledgeAcquisitionRecord[] {
  const parsed = input;
  const bundle = KnowledgeAcquisitionBundleDocumentSchema.safeParse(parsed);
  if (bundle.success) {
    return Object.freeze(bundle.data.records.map((document) => document.record));
  }

  const document = KnowledgeAcquisitionRecordDocumentSchema.safeParse(parsed);
  if (document.success) {
    return Object.freeze([document.data.record]);
  }

  const record = KnowledgeAcquisitionRecordSchema.safeParse(parsed);
  if (record.success) {
    return Object.freeze([normalizeKnowledgeAcquisitionRecord(record.data)]);
  }

  const bundleIssues = bundle.success ? [] : bundle.error.issues.map((issue) => `bundle.${issue.path.join(".")}: ${issue.message}`);
  const documentIssues = document.success ? [] : document.error.issues.map((issue) => `document.${issue.path.join(".")}: ${issue.message}`);
  const recordIssues = record.success ? [] : record.error.issues.map((issue) => `record.${issue.path.join(".")}: ${issue.message}`);
  const message = [...bundleIssues, ...documentIssues, ...recordIssues].join("; ");

  throw new Error(`Invalid knowledge acquisition document: ${message}`);
}

export function parseKnowledgeAcquisitionDocumentText(text: string): readonly KnowledgeAcquisitionRecord[] {
  return parseKnowledgeAcquisitionDocument(parseReviewerKnowledgeDocumentText(text));
}

export function normalizeKnowledgeAcquisitionDocumentInput(input: KnowledgeAcquisitionDocumentInput): readonly KnowledgeAcquisitionRecord[] {
  if ("records" in input) {
    return Object.freeze(input.records.map((document) => document.record));
  }
  if ("record" in input) {
    return Object.freeze([input.record]);
  }
  return Object.freeze([input]);
}

export function deriveKnowledgeAcquisitionFingerprint(record: KnowledgeAcquisitionRecord): string {
  return stableSerializeKnowledgeAcquisitionValue({
    source: record.source,
    knowledgeType: record.knowledgeType,
    domain: record.domain,
    concepts: record.concepts,
    storyContext: record.storyContext,
    evidence: record.evidence,
    reasoning: record.reasoning,
    decision: record.decision,
    alternativeDecisions: record.alternativeDecisions,
    rejectedInterpretations: record.rejectedInterpretations,
    relatedLessons: record.relatedLessons,
    relatedPatterns: record.relatedPatterns,
    relatedDecisionRecords: record.relatedDecisionRecords,
    relatedBenchmarks: record.relatedBenchmarks,
    knowledgeDebtReference: record.knowledgeDebtReference,
    futureReviewNotes: record.futureReviewNotes,
    reviewerId: record.reviewerId,
    reviewerName: record.reviewerName,
    agreementState: record.agreementState,
    disagreementGroupId: record.disagreementGroupId,
    supersedesId: record.supersedesId,
    supersededById: record.supersededById,
    relatedRecordIds: record.relatedRecordIds,
  });
}

export function deriveKnowledgeAcquisitionId(record: KnowledgeAcquisitionRecord): string {
  const digest = createHash("sha256").update(deriveKnowledgeAcquisitionFingerprint(record), "utf8").digest("hex").slice(0, 16);
  const type = normalizeKnowledgeAcquisitionText(record.knowledgeType).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "record";
  const domain = normalizeKnowledgeAcquisitionText(record.domain).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "domain";
  return `ka_${type}_${domain}_${digest}`;
}
