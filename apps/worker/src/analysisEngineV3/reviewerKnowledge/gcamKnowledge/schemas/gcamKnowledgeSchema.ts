import { createHash } from "node:crypto";

import { parseReviewerKnowledgeDocumentText } from "../../reviewerKnowledgeIO.js";
import type {
  GcamKnowledgeCatalog,
  GcamKnowledgeDocument,
  GcamKnowledgeKind,
  GcamKnowledgeRecord,
} from "./gcamKnowledgeTypes.js";

export function normalizeGcamKnowledgeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeGcamKnowledgeKey(value: string): string {
  return normalizeGcamKnowledgeText(value).toLowerCase();
}

export function stableSerializeGcamKnowledge(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeGcamKnowledge(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => `${JSON.stringify(key)}:${stableSerializeGcamKnowledge(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function hashGcamKnowledgeValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeGcamKnowledge(value), "utf8").digest("hex");
}

export function deriveGcamKnowledgeRecordId(record: Pick<GcamKnowledgeRecord, "kind" | "title" | "source" | "version">): string {
  const parts = [
    normalizeGcamKnowledgeKey(record.kind),
    normalizeGcamKnowledgeKey(record.title),
    normalizeGcamKnowledgeKey(record.source.documentId),
    record.source.articleId === null ? "article:none" : `article:${record.source.articleId}`,
    record.source.atomId === null ? "atom:none" : `atom:${normalizeGcamKnowledgeKey(record.source.atomId)}`,
    normalizeGcamKnowledgeKey(record.version),
  ];
  return `gcam.${parts.join(".")}`;
}

export function freezeGcamKnowledgeCatalog(catalog: GcamKnowledgeCatalog): GcamKnowledgeCatalog {
  const freezeRecords = <T extends ReadonlyArray<GcamKnowledgeRecord>>(records: T): T =>
    Object.freeze(records.map((record) =>
      Object.freeze({
        ...record,
        concepts: Object.freeze([...record.concepts]),
        domains: Object.freeze([...record.domains]),
        relatedLessons: Object.freeze([...record.relatedLessons]),
        relatedPatternLibraries: Object.freeze([...record.relatedPatternLibraries]),
        relatedDecisionRecords: Object.freeze([...record.relatedDecisionRecords]),
        relatedBenchmarks: Object.freeze([...record.relatedBenchmarks]),
        relatedMethodologies: Object.freeze([...record.relatedMethodologies]),
        relatedKnowledgeAcquisitionRecords: Object.freeze([...record.relatedKnowledgeAcquisitionRecords]),
        evidence: Object.freeze([...record.evidence]),
        reasoning: Object.freeze([...record.reasoning]),
        alternativeInterpretations: Object.freeze([...record.alternativeInterpretations]),
        rejectedInterpretations: Object.freeze([...record.rejectedInterpretations]),
        knowledgeDebtLinks: Object.freeze([...record.knowledgeDebtLinks]),
        futureReviewNotes: Object.freeze([...record.futureReviewNotes]),
        metadata: Object.freeze({ ...record.metadata }),
      }) as GcamKnowledgeRecord,
    )) as T;

  return Object.freeze({
    articles: Object.freeze(catalog.articles.map((record) => Object.freeze({
      ...record,
      atomIds: Object.freeze([...record.atomIds]),
    })) as GcamKnowledgeCatalog["articles"]),
    atoms: Object.freeze(catalog.atoms.map((record) => Object.freeze({
      ...record,
    })) as GcamKnowledgeCatalog["atoms"]),
    reviewerExamples: freezeRecords(catalog.reviewerExamples),
    reviewerComments: freezeRecords(catalog.reviewerComments),
    reviewerObservations: freezeRecords(catalog.reviewerObservations),
    reviewerInterpretations: freezeRecords(catalog.reviewerInterpretations),
    reviewerExceptions: freezeRecords(catalog.reviewerExceptions),
    reviewerCorrections: freezeRecords(catalog.reviewerCorrections),
    reviewerDisagreements: freezeRecords(catalog.reviewerDisagreements),
    reviewerNotes: freezeRecords(catalog.reviewerNotes),
    knowledgeDebt: Object.freeze(catalog.knowledgeDebt.map((record) => Object.freeze({
      ...record,
      concepts: Object.freeze([...record.concepts]),
      domains: Object.freeze([...record.domains]),
      relatedLessons: Object.freeze([...record.relatedLessons]),
      relatedPatternLibraries: Object.freeze([...record.relatedPatternLibraries]),
      relatedDecisionRecords: Object.freeze([...record.relatedDecisionRecords]),
      relatedBenchmarks: Object.freeze([...record.relatedBenchmarks]),
      relatedMethodologies: Object.freeze([...record.relatedMethodologies]),
      relatedKnowledgeAcquisitionRecords: Object.freeze([...record.relatedKnowledgeAcquisitionRecords]),
      evidence: Object.freeze([...record.evidence]),
      reasoning: Object.freeze([...record.reasoning]),
      alternativeInterpretations: Object.freeze([...record.alternativeInterpretations]),
      rejectedInterpretations: Object.freeze([...record.rejectedInterpretations]),
      knowledgeDebtLinks: Object.freeze([...record.knowledgeDebtLinks]),
      futureReviewNotes: Object.freeze([...record.futureReviewNotes]),
      missingCoverage: Object.freeze([...record.missingCoverage]),
      metadata: Object.freeze({ ...record.metadata }),
    })) as GcamKnowledgeCatalog["knowledgeDebt"]),
  });
}

export function createEmptyGcamKnowledgeCatalog(): GcamKnowledgeCatalog {
  return Object.freeze({
    articles: Object.freeze([]),
    atoms: Object.freeze([]),
    reviewerExamples: Object.freeze([]),
    reviewerComments: Object.freeze([]),
    reviewerObservations: Object.freeze([]),
    reviewerInterpretations: Object.freeze([]),
    reviewerExceptions: Object.freeze([]),
    reviewerCorrections: Object.freeze([]),
    reviewerDisagreements: Object.freeze([]),
    reviewerNotes: Object.freeze([]),
    knowledgeDebt: Object.freeze([]),
  });
}

export function parseGcamKnowledgeDocumentText(text: string): unknown {
  return parseReviewerKnowledgeDocumentText(text);
}

export function serializeGcamKnowledgeDocument(document: GcamKnowledgeDocument): string {
  return stableSerializeGcamKnowledge(document);
}

