import { DEFAULT_REVIEWER_QUESTION_SET } from "../../reviewerQuestions/reviewerQuestionDefaults.js";
import type { KnowledgeLintCoverage, KnowledgeLintMessage, KnowledgeLintPack, KnowledgeLintReport, KnowledgeLintStatistics } from "./knowledgeLintTypes.js";
import {
  computeOverallScore,
  computePackScore,
  computeStatistics,
  sortLintMessages,
  validateConfidence,
  validateConcepts,
  validateDeterminism,
  validateEvidence,
  validateExamples,
  validateGcamMapping,
  validateGlossary,
  validateMetadata,
  validateRelationships,
  validateReportTemplate,
  validateReviewerQuestions,
  validateExceptions,
} from "./knowledgeLintRules.js";
import { createKnowledgeLintReport } from "./knowledgeLintReport.js";
import type { ReviewerAcademyPackDocument } from "../academy/reviewerAcademyTypes.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack } from "../reviewerKnowledgeNormalization.js";
import type { KnowledgeLintQuestion, KnowledgeLintConfidenceRule, KnowledgeLintArticleMapping, KnowledgeLintGlossaryEntry, KnowledgeLintRelationship } from "./knowledgeLintTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function deriveLanguage(text: string): string {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (arabic === 0 && latin === 0) return "und";
  return arabic >= latin ? "ar" : "en";
}

function deriveCategoryFromSource(sourcePath: string | null, metadataId: string): string {
  if (sourcePath) {
    const parts = sourcePath.replace(/\\/g, "/").split("/").filter(Boolean);
    return normalizeText(parts[parts.length - 1] ?? metadataId);
  }
  return normalizeText(metadataId);
}

function makeReviewQuestions(): readonly KnowledgeLintQuestion[] {
  return Object.freeze(DEFAULT_REVIEWER_QUESTION_SET.questions.map((question) => Object.freeze({
    id: question.id,
    category: question.category,
    purpose: question.purpose,
    expectedAnswerFormat: question.expectedAnswerFormat,
    reasoningGuidance: question.reasoningGuidance,
    evidenceRequirements: Object.freeze([...question.evidenceRequirements]),
  })));
}

function makeConfidenceRules(): readonly KnowledgeLintConfidenceRule[] {
  return Object.freeze([
    Object.freeze({ threshold: 0, label: "minimum" }),
    Object.freeze({ threshold: 25, label: "weak" }),
    Object.freeze({ threshold: 50, label: "moderate" }),
    Object.freeze({ threshold: 75, label: "strong" }),
    Object.freeze({ threshold: 100, label: "certain" }),
  ]);
}

function mapGlossaryRelationships(pack: ReviewerKnowledgePack): readonly KnowledgeLintGlossaryEntry[] {
  return Object.freeze(pack.glossary_relationships.map((entry, index) => Object.freeze({
    id: `${normalizeId(entry.term)}-${index}`,
    term: normalizeText(entry.term),
    definition: normalizeText(entry.relation),
    aliases: Object.freeze([]),
    conceptIds: Object.freeze(entry.concept_id ? [normalizeId(entry.concept_id)] : []),
    notes: Object.freeze(entry.note ? [normalizeText(entry.note)] : []),
  })));
}

function mapArticleMappings(pack: ReviewerKnowledgePack): readonly KnowledgeLintArticleMapping[] {
  return Object.freeze(pack.article_mapping.flatMap((entry) => {
    const atomIds = entry.atom_ids.length > 0 ? entry.atom_ids : [null];
    return atomIds.map((atomId, index) => Object.freeze({
      articleId: entry.article_id,
      articleTitle: normalizeText(entry.role || pack.title),
      articleNumber: String(entry.article_id),
      atomNumber: atomId === null ? null : normalizeText(atomId),
      reportTitle: normalizeText(entry.role || pack.title),
      note: entry.note === null ? null : normalizeText(entry.note),
    }));
  }));
}

function splitTextList(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map((value) => normalizeText(value)).filter(Boolean));
}

function mapEvidence(pack: ReviewerKnowledgePack) {
  const required = splitTextList(pack.required_evidence);
  const insufficient = splitTextList(pack.insufficient_evidence);
  const positive = splitTextList(pack.positive_examples);
  const negative = splitTextList(pack.negative_examples);
  const weak = required.slice(0, Math.max(1, Math.min(2, required.length)));
  const strong = positive.slice(0, Math.max(1, Math.min(2, positive.length)));
  const minimum = required.slice(0, 1);
  return Object.freeze({
    minimum,
    strong,
    weak,
    insufficient: insufficient.length > 0 ? insufficient : negative.slice(0, 1),
  });
}

function buildImplicitConcept(pack: ReviewerKnowledgePack, sourcePath: string | null): KnowledgeLintPack["concepts"][number] {
  const glossaryIds = Object.freeze(pack.glossary_relationships.map((entry) => normalizeId(entry.term)));
  const reportTitle = normalizeText(pack.title);
  return Object.freeze({
    id: normalizeId(pack.id),
    name: normalizeText(pack.title),
    definition: normalizeText(pack.purpose),
    examples: splitTextList(pack.positive_examples),
    counterExamples: splitTextList(pack.negative_examples),
    borderlineExamples: splitTextList(pack.common_false_positives),
    educationalExamples: splitTextList(pack.legal_exceptions),
    fictionExamples: splitTextList(pack.legal_exceptions),
    reviewerQuestions: makeReviewQuestions(),
    evidence: mapEvidence(pack),
    exceptions: splitTextList(pack.legal_exceptions),
    falsePositives: splitTextList(pack.common_false_positives),
    falseNegatives: splitTextList(pack.insufficient_evidence),
    reportTemplate: Object.freeze({
      findingTitle: reportTitle,
      reasonTemplate: normalizeText(pack.reporting_guidance[0] ?? pack.purpose),
      recommendationTemplate: normalizeText(pack.reporting_guidance[1] ?? pack.purpose),
      severity: "medium",
      priority: 50,
      reportCategory: deriveCategoryFromSource(sourcePath, pack.id),
    }),
    confidenceRules: makeConfidenceRules(),
    glossaryIds,
    articleMappings: mapArticleMappings(pack),
    parentConceptId: null,
    childConceptIds: Object.freeze([]),
    notes: Object.freeze([]),
  });
}

export function convertAcademyDocumentToLintPack(document: ReviewerAcademyPackDocument, sourcePath: string | null): KnowledgeLintPack {
  const pack = document.pack;
  const metadata = Object.freeze({
    id: normalizeId(document.metadata.id),
    version: `${document.metadata.version.major}.${document.metadata.version.minor}.${document.metadata.version.patch}`,
    title: normalizeText(document.metadata.title),
    category: deriveCategoryFromSource(sourcePath, document.metadata.id),
    language: deriveLanguage([
      document.metadata.title,
      document.metadata.description,
      ...(pack ? [...pack.positive_examples, ...pack.negative_examples, ...pack.required_evidence, ...pack.reporting_guidance] : []),
    ].join(" ")),
    description: normalizeText(document.metadata.description),
  });

  const concepts = pack ? [buildImplicitConcept(normalizeReviewerKnowledgePack(pack), sourcePath)] : [];
  const glossary = pack ? Object.freeze(mapGlossaryRelationships(normalizeReviewerKnowledgePack(pack))) : Object.freeze([]);
  return Object.freeze({
    metadata,
    concepts,
    glossary,
    relationships: Object.freeze([]),
    sourcePath: sourcePath ? normalizeText(sourcePath) : null,
    notes: Object.freeze([]),
  });
}

export function validateKnowledgeLintPack(pack: KnowledgeLintPack): readonly KnowledgeLintMessage[] {
  const issues = [
    ...validateMetadata(pack),
    ...validateConcepts(pack),
    ...validateEvidence(pack),
    ...validateExceptions(pack),
    ...validateReviewerQuestions(pack),
    ...validateGlossary(pack),
    ...validateRelationships(pack),
    ...validateGcamMapping(pack),
    ...validateReportTemplate(pack),
    ...validateConfidence(pack),
    ...validateExamples(pack),
    ...validateDeterminism(pack),
  ];

  return sortLintMessages(issues);
}

export function buildKnowledgeLintReport(pack: KnowledgeLintPack): KnowledgeLintReport {
  const issues = validateKnowledgeLintPack(pack);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  const statistics = computeStatistics(pack, issues);
  const coverage: KnowledgeLintCoverage = Object.freeze({
    metadata: 100,
    concepts: 100,
    evidence: 100,
    exceptions: 100,
    reviewerQuestions: 100,
    glossary: 100,
    relationships: 100,
    gcamMapping: 100,
    reportTemplate: 100,
    confidence: 100,
    examples: 100,
  });
  const packScore = computePackScore(statistics, coverage);
  const overallScore = computeOverallScore(statistics, packScore);
  return createKnowledgeLintReport(pack, {
    metadata: pack.metadata,
    sourcePath: pack.sourcePath,
    errors,
    warnings,
    statistics,
    coverage,
    packScore,
    overallScore,
  });
}
