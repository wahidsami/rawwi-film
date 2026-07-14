/**
 * Compatibility layer for reviewer lesson documents.
 *
 * Why this file exists:
 * - Supports both the current lesson schema and older legacy lesson shapes.
 * - Preserves compatibility for lessons that were authored before the current structured schema.
 *
 * Active V3 reviewer pipeline participation:
 * - Active compatibility layer for lesson loading and normalization, not a reasoning module.
 *
 * Backward compatibility:
 * - Retained intentionally so legacy lesson assets still parse and normalize.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after all lesson assets have migrated to the current schema.
 */
import { z } from "zod";
import type {
  LessonConcept,
  LessonConceptRelationship,
  LessonEvidenceRules,
  LessonGCAMMapping,
  LessonGlossaryReference,
  LessonPackBlueprint,
  LessonReportTemplate,
  LessonReviewerQuestion,
  LessonVersion,
  ReviewerKnowledgeLesson,
  ReviewerKnowledgeLessonDocument,
  ReviewerKnowledgeLessonMetadata,
} from "./lessonTypes.js";

const NonEmptyTrimmedString = z.string().refine((value) => value.normalize("NFC").trim().length > 0, {
  message: "must be a non-empty string",
});

const OptionalTrimmedString = z.union([z.null(), NonEmptyTrimmedString]).optional().transform((value) => value ?? null);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function toStringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map(normalizeText)
    : [];
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function confidenceGuidanceList(primary: unknown, fallback: unknown, hierarchy: unknown): readonly string[] {
  if (Array.isArray(primary)) return toStringList(primary);
  if (!isPlainObject(fallback)) return [];
  if (Array.isArray(hierarchy)) {
    return hierarchy
      .filter(isPlainObject)
      .sort((left, right) => toNumber(right.confidence, 0) - toNumber(left.confidence, 0) || String(left.level ?? "").localeCompare(String(right.level ?? "")))
      .map((entry) => {
        const level = toNumber(entry.level, 0);
        const name = typeof entry.name === "string" ? normalizeText(entry.name) : "";
        const confidence = toNumber(entry.confidence, 0);
        return normalizeText(`${level}:${name}:${confidence}`);
      })
      .filter(Boolean);
  }
  return Object.keys(fallback)
    .sort((left, right) => Number(right) - Number(left) || left.localeCompare(right))
    .map((key) => fallback[key])
    .filter((entry): entry is string => typeof entry === "string")
    .map(normalizeText);
}

function deriveLegacyEvidenceRules(input: Record<string, unknown>): LessonEvidenceRules {
  const evidenceRules = isPlainObject(input.evidenceRules) ? input.evidenceRules : {};
  const hierarchy = Array.isArray(input.evidenceHierarchy) ? input.evidenceHierarchy.filter(isPlainObject) : [];
  const hierarchyNames = hierarchy
    .map((entry) => (typeof entry.name === "string" ? normalizeText(entry.name) : ""))
    .filter(Boolean);

  const minimum = toStringList((evidenceRules as Record<string, unknown>).minimum);
  const strong = toStringList((evidenceRules as Record<string, unknown>).strong);
  const weak = toStringList((evidenceRules as Record<string, unknown>).weak);
  const insufficient = toStringList((evidenceRules as Record<string, unknown>).insufficient);
  const confidenceGuidance = confidenceGuidanceList((evidenceRules as Record<string, unknown>).confidenceGuidance, input.confidenceGuidance, input.evidenceHierarchy);

  return Object.freeze({
    minimum: Object.freeze(minimum.length > 0 ? minimum : [hierarchyNames[0] ?? "Context is required before judgment."]),
    strong: Object.freeze(strong.length > 0 ? strong : hierarchyNames.slice(1, 3).concat([
      "Multiple surrounding sentences support the interpretation.",
      "Scene context and speaker identity reinforce the meaning.",
    ]).filter(Boolean)),
    weak: Object.freeze(weak.length > 0 ? weak : hierarchyNames.slice(3, 4).concat([
      "Single sentence without surrounding context.",
      "Ambiguous wording that needs reviewer caution.",
    ]).filter(Boolean)),
    insufficient: Object.freeze(insufficient.length > 0 ? insufficient : [
      "Speculation without supporting context.",
      "Assumptions about meaning without evidence.",
    ]),
    confidenceGuidance: Object.freeze(confidenceGuidance.length > 0 ? confidenceGuidance : [
      "100: Explicit context and clear meaning.",
      "85: Strong contextual signals.",
      "65: Partial context with some ambiguity.",
      "40: Weak context and high uncertainty.",
      "0: No reliable interpretation.",
    ]),
  });
}

export const LessonVersionSchema: z.ZodType<LessonVersion> = z.object({
  major: z.number().int().nonnegative(),
  minor: z.number().int().nonnegative(),
  patch: z.number().int().nonnegative(),
}).strict();

const LessonConceptSchema: z.ZodType<LessonConcept> = z.object({
  id: NonEmptyTrimmedString,
  title: NonEmptyTrimmedString,
  summary: NonEmptyTrimmedString,
  tags: z.array(NonEmptyTrimmedString),
  target: z.union([z.null(), NonEmptyTrimmedString]),
  articleIds: z.array(z.number().int().positive()),
}).strict();

const LessonReviewerQuestionSchema: z.ZodType<LessonReviewerQuestion> = z.object({
  id: NonEmptyTrimmedString,
  purpose: NonEmptyTrimmedString,
  expectedAnswerFormat: NonEmptyTrimmedString,
  reasoningGuidance: NonEmptyTrimmedString,
  evidenceRequirements: z.array(NonEmptyTrimmedString),
}).strict();

const LessonEvidenceRulesSchema: z.ZodType<LessonEvidenceRules> = z.object({
  minimum: z.array(NonEmptyTrimmedString),
  strong: z.array(NonEmptyTrimmedString),
  weak: z.array(NonEmptyTrimmedString),
  insufficient: z.array(NonEmptyTrimmedString),
  confidenceGuidance: z.array(NonEmptyTrimmedString),
}).strict();

const LessonConceptRelationshipSchema: z.ZodType<LessonConceptRelationship, z.ZodTypeDef, any> = z.object({
  fromConceptId: NonEmptyTrimmedString,
  toConceptId: NonEmptyTrimmedString,
  relation: NonEmptyTrimmedString,
  note: OptionalTrimmedString,
}).strict();

const LessonGlossaryReferenceSchema: z.ZodType<LessonGlossaryReference, z.ZodTypeDef, any> = z.object({
  term: NonEmptyTrimmedString,
  conceptId: z.union([z.null(), NonEmptyTrimmedString]),
  relation: NonEmptyTrimmedString,
  note: OptionalTrimmedString,
}).strict();

const LessonGCAMMappingSchema: z.ZodType<LessonGCAMMapping, z.ZodTypeDef, any> = z.object({
  articleId: z.number().int().positive(),
  articleTitle: NonEmptyTrimmedString,
  articleNumber: NonEmptyTrimmedString,
  atomNumber: z.union([z.null(), NonEmptyTrimmedString]),
  reportTitle: NonEmptyTrimmedString,
  note: OptionalTrimmedString,
}).strict();

const LessonReportTemplateSchema: z.ZodType<LessonReportTemplate> = z.object({
  findingTitle: NonEmptyTrimmedString,
  reasonTemplate: NonEmptyTrimmedString,
  recommendationTemplate: NonEmptyTrimmedString,
  severity: z.enum(["low", "medium", "high", "critical"]),
  priority: z.number(),
  reportCategory: NonEmptyTrimmedString,
}).strict();

const ReviewerKnowledgeLessonMetadataSchema: z.ZodType<ReviewerKnowledgeLessonMetadata> = z.record(z.unknown());

export const ReviewerKnowledgeLessonSchema: z.ZodType<ReviewerKnowledgeLesson, z.ZodTypeDef, any> = z.object({
  id: NonEmptyTrimmedString,
  title: NonEmptyTrimmedString,
  version: LessonVersionSchema,
  language: NonEmptyTrimmedString,
  summary: NonEmptyTrimmedString,
  learningObjectives: z.array(NonEmptyTrimmedString),
  concepts: z.array(LessonConceptSchema).min(1),
  reviewerQuestions: z.array(LessonReviewerQuestionSchema).min(1),
  examples: z.array(NonEmptyTrimmedString).min(1),
  counterExamples: z.array(NonEmptyTrimmedString).min(1),
  exceptions: z.array(NonEmptyTrimmedString).min(1),
  evidenceRules: LessonEvidenceRulesSchema,
  conceptRelationships: z.array(LessonConceptRelationshipSchema),
  glossaryReferences: z.array(LessonGlossaryReferenceSchema),
  gcamMappings: z.array(LessonGCAMMappingSchema),
  reportTemplates: z.array(LessonReportTemplateSchema).min(1),
  benchmarkReferences: z.array(NonEmptyTrimmedString),
  prerequisites: z.array(NonEmptyTrimmedString),
  relatedLessons: z.array(NonEmptyTrimmedString),
  metadata: ReviewerKnowledgeLessonMetadataSchema,
}).strict();

export const ReviewerKnowledgeLessonDocumentSchema = z.object({
  schema_version: z.literal(1),
  lesson_version: LessonVersionSchema,
  lesson: ReviewerKnowledgeLessonSchema,
}).strict();

export const LessonPackBlueprintSchema: z.ZodType<LessonPackBlueprint, z.ZodTypeDef, any> = z.object({
  id: NonEmptyTrimmedString,
  module_id: NonEmptyTrimmedString,
  title: NonEmptyTrimmedString,
  default_question_set_id: z.union([z.null(), NonEmptyTrimmedString]).optional(),
  trigger_concept_ids: z.array(NonEmptyTrimmedString),
  purpose: NonEmptyTrimmedString,
  protected_interests: z.array(NonEmptyTrimmedString),
  protected_concepts: z.array(NonEmptyTrimmedString),
  summary: z.union([z.null(), NonEmptyTrimmedString]).optional(),
}).strict();

function parseLegacyFindingLesson(input: unknown): ReviewerKnowledgeLessonDocument | null {
  if (!isPlainObject(input)) return null;
  if (!isPlainObject(input.definitions)) return null;

  const versionText = typeof input.version === "string" ? normalizeText(input.version) : "";
  const versionParts = versionText.split(".").map((value) => Number(value));
  if (versionParts.length !== 3 || versionParts.some((part) => !Number.isInteger(part) || part < 0)) {
    return null;
  }

  const id = typeof input.id === "string" ? normalizeId(input.id) : "";
  const title = typeof input.title === "string" ? normalizeText(input.title) : "";
  const language = typeof input.language === "string" ? normalizeText(input.language).toLowerCase() : "";
  const category = typeof input.category === "string" ? normalizeId(input.category) : "";
  const summary = typeof input.summary === "string" ? normalizeText(input.summary) : "";

  if (!id || !title || !language || !category || !summary) return null;
  if (!Array.isArray(input.learningObjectives) || !Array.isArray(input.reviewerQuestions) || !Array.isArray(input.examples) || !Array.isArray(input.counterExamples)) {
    return null;
  }

  const definitions = input.definitions as Record<string, unknown>;
  const metadata = isPlainObject(input.metadata) ? input.metadata : {};
  const reportTemplate = isPlainObject(input.reportTemplate) ? input.reportTemplate : {};
  const legacyExamples = input.examples as readonly Record<string, unknown>[];
  const legacyCounterExamples = input.counterExamples as readonly Record<string, unknown>[];

  const concept: LessonConcept = Object.freeze({
    id: "finding",
    title: "Finding",
    summary: typeof definitions.finding === "string" ? normalizeText(definitions.finding) : summary,
    tags: Object.freeze([category, "foundation", "finding"].map(normalizeText).filter(Boolean)),
    target: null,
    articleIds: Object.freeze([]),
  });

  const lessonQuestions: LessonReviewerQuestion[] = (input.reviewerQuestions as readonly unknown[]).map((question, index) => {
    const text = typeof question === "string" ? normalizeText(question) : normalizeText(JSON.stringify(question));
    return {
      id: `q${String(index + 1).padStart(2, "0")}`,
      purpose: text,
      expectedAnswerFormat: "short answer",
      reasoningGuidance: text,
      evidenceRequirements: [text],
    };
  });

  const findingsEvidenceRules = deriveLegacyEvidenceRules(input);

  const findingDefinition = typeof definitions.finding === "string" ? normalizeText(definitions.finding) : summary;
  const evidenceDefinition = typeof definitions.evidence === "string" ? normalizeText(definitions.evidence) : "Specific words, dialogue or narration that support the finding.";
  const assumptionDefinition = typeof definitions.assumption === "string" ? normalizeText(definitions.assumption) : "A conclusion that is not supported by explicit or contextual evidence.";
  const contextDefinition = typeof definitions.context === "string" ? normalizeText(definitions.context) : "Information surrounding the evidence that changes its meaning.";

  const lesson: ReviewerKnowledgeLesson = Object.freeze({
    id,
    title,
    version: LessonVersionSchema.parse({ major: versionParts[0], minor: versionParts[1], patch: versionParts[2] }),
    language,
    summary,
    learningObjectives: Object.freeze(toStringList(input.learningObjectives)),
    concepts: Object.freeze([concept]),
    reviewerQuestions: Object.freeze(lessonQuestions.map((question) => Object.freeze(question))),
    examples: Object.freeze(legacyExamples.map((entry) => normalizeText(typeof entry.text === "string" ? entry.text : "")).filter(Boolean)),
    counterExamples: Object.freeze(legacyCounterExamples.map((entry) => normalizeText(typeof entry.text === "string" ? entry.text : "")).filter(Boolean)),
      exceptions: Object.freeze(toStringList(input.exceptions).length > 0 ? toStringList(input.exceptions) : [
        "Context must be evaluated before inference.",
        "Unsupported speculation must be rejected.",
      ]),
    evidenceRules: findingsEvidenceRules,
    conceptRelationships: Object.freeze([]),
    glossaryReferences: Object.freeze([
      Object.freeze({ term: "finding", conceptId: "finding", relation: "definition", note: findingDefinition }),
      Object.freeze({ term: "evidence", conceptId: "finding", relation: "definition", note: evidenceDefinition }),
      Object.freeze({ term: "assumption", conceptId: "finding", relation: "definition", note: assumptionDefinition }),
      Object.freeze({ term: "context", conceptId: "finding", relation: "definition", note: contextDefinition }),
    ]),
    gcamMappings: Object.freeze(Array.isArray(input.gcamMapping)
      ? input.gcamMapping.filter(isPlainObject).map((entry) => Object.freeze({
        articleId: toNumber(entry.article_id),
        articleTitle: typeof entry.article_title === "string" ? normalizeText(entry.article_title) : "",
        articleNumber: typeof entry.article_number === "string" ? normalizeText(entry.article_number) : "",
        atomNumber: typeof entry.atom_number === "string" ? normalizeText(entry.atom_number) : null,
        reportTitle: typeof entry.report_title === "string" ? normalizeText(entry.report_title) : "",
        note: typeof entry.note === "string" ? normalizeText(entry.note) : null,
      }))
      : []),
    reportTemplates: Object.freeze([Object.freeze({
      findingTitle: typeof reportTemplate.findingTitle === "string" ? normalizeText(reportTemplate.findingTitle) : title,
      reasonTemplate: typeof reportTemplate.reasonTemplate === "string" ? normalizeText(reportTemplate.reasonTemplate) : summary,
      recommendationTemplate: typeof reportTemplate.recommendationTemplate === "string" ? normalizeText(reportTemplate.recommendationTemplate) : "Continue reviewer evaluation.",
      severity: "medium",
      priority: toNumber(metadata.priority, 1),
      reportCategory: category,
    })]),
    benchmarkReferences: Object.freeze(toStringList(input.benchmarkReferences)),
    prerequisites: Object.freeze([]),
    relatedLessons: Object.freeze([]),
    metadata: Object.freeze({
      author: typeof metadata.author === "string" ? normalizeText(metadata.author) : "Unknown",
      reviewLevel: typeof metadata.reviewLevel === "string" ? normalizeText(metadata.reviewLevel) : "Foundation",
      priority: toNumber(metadata.priority, 1),
      category,
      definitions,
      reviewerPrinciples: Array.isArray(input.reviewerPrinciples) ? input.reviewerPrinciples.filter((entry): entry is string => typeof entry === "string").map(normalizeText) : [],
      decisionTree: Array.isArray(input.decisionTree) ? input.decisionTree : [],
      commonMistakes: Array.isArray(input.commonMistakes) ? input.commonMistakes.filter((entry): entry is string => typeof entry === "string").map(normalizeText) : [],
      confidenceGuidance: isPlainObject(input.confidenceGuidance) ? input.confidenceGuidance : {},
      lesson_type: "foundation",
    }),
  });

  return Object.freeze({
    schema_version: 1,
    lesson_version: lesson.version,
    lesson,
  });
}

export function parseReviewerKnowledgeLessonDocument(input: unknown): ReviewerKnowledgeLessonDocument {
  return ReviewerKnowledgeLessonDocumentSchema.parse(input);
}

export function parseReviewerKnowledgeLesson(input: unknown): ReviewerKnowledgeLesson {
  return ReviewerKnowledgeLessonSchema.parse(input);
}

export function parseReviewerKnowledgeLessonInput(input: unknown): ReviewerKnowledgeLessonDocument {
  const currentDocument = ReviewerKnowledgeLessonDocumentSchema.safeParse(input);
  if (currentDocument.success) {
    return currentDocument.data;
  }

  const legacyDocument = parseLegacyFindingLesson(input);
  if (legacyDocument) {
    return legacyDocument;
  }

  const currentLesson = ReviewerKnowledgeLessonSchema.safeParse(input);
  if (currentLesson.success) {
    return {
      schema_version: 1,
      lesson_version: currentLesson.data.version,
      lesson: currentLesson.data,
    };
  }

  const message = [
    ...currentDocument.error.issues.map((issue) => `document.${issue.path.join(".")}: ${issue.message}`),
    ...currentLesson.error.issues.map((issue) => `lesson.${issue.path.join(".")}: ${issue.message}`),
  ].join("; ");

  throw new Error(`Invalid reviewer knowledge lesson document: ${message}`);
}

export function parseLessonPackBlueprint(input: unknown): LessonPackBlueprint {
  return LessonPackBlueprintSchema.parse(input);
}
