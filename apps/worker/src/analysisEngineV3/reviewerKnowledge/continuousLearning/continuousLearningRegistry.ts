import { z } from "zod";

import {
  clampContinuousLearningConfidence,
  hashContinuousLearningValue,
  normalizeContinuousLearningId,
  normalizeContinuousLearningText,
  uniqueSortedContinuousLearningStrings,
} from "./continuousLearningUtils.js";
import type {
  ContinuousLearningArtifact,
  ContinuousLearningArtifacts,
  ContinuousLearningCoverageReport,
  ContinuousLearningRecord,
  ContinuousLearningRegistry,
  ContinuousLearningSearchQuery,
  ContinuousLearningSearchResult,
  ContinuousLearningValidationIssue,
  ContinuousLearningValidationResult,
} from "./continuousLearningTypes.js";

const NonEmptyString = z.string().refine((value) => normalizeContinuousLearningText(value).length > 0, {
  message: "must be a non-empty string",
});

const OptionalNonEmptyString = z.union([z.null(), NonEmptyString]).optional().transform((value) => value ?? null);

const StringList = z.array(NonEmptyString);

const ContinuousLearningArtifactSchema: z.ZodType<ContinuousLearningArtifact, z.ZodTypeDef, any> = z.object({
  id: z.string().optional().default(""),
  version: NonEmptyString,
  title: NonEmptyString,
  description: NonEmptyString,
  confidence: z.number().finite(),
  sourceIds: StringList,
}).strict();

const ContinuousLearningArtifactsSchema: z.ZodType<ContinuousLearningArtifacts, z.ZodTypeDef, any> = z.object({
  lessons: z.array(ContinuousLearningArtifactSchema),
  cases: z.array(ContinuousLearningArtifactSchema),
  patterns: z.array(ContinuousLearningArtifactSchema),
  knowledgeUpdates: z.array(ContinuousLearningArtifactSchema),
  decisionMemories: z.array(ContinuousLearningArtifactSchema),
  reviewerImprovements: z.array(ContinuousLearningArtifactSchema),
}).strict();

const ContinuousLearningRecordSchema: z.ZodType<ContinuousLearningRecord, z.ZodTypeDef, any> = z.object({
  id: z.string().optional().default(""),
  version: NonEmptyString,
  source: NonEmptyString,
  date: NonEmptyString,
  signalKind: z.enum([
    "board_correction",
    "gcam_correction",
    "approved_finding",
    "rejected_finding",
    "human_override",
    "false_positive",
    "false_negative",
    "new_precedent",
  ]),
  domain: NonEmptyString,
  concepts: StringList,
  evidence: StringList,
  reasoning: StringList,
  decision: NonEmptyString,
  confidence: z.number().finite(),
  artifacts: ContinuousLearningArtifactsSchema,
  knowledgeAcquisitionRecordIds: StringList,
  reviewerId: OptionalNonEmptyString,
  reviewerName: OptionalNonEmptyString,
  agreementState: z.enum(["consensus", "disagreement", "pending"]),
  disagreementGroupId: OptionalNonEmptyString,
  supersedesId: OptionalNonEmptyString,
  supersededById: OptionalNonEmptyString,
  relatedRecordIds: StringList,
}).strict();

function pushIssue(
  issues: ContinuousLearningValidationIssue[],
  severity: ContinuousLearningValidationIssue["severity"],
  code: string,
  path: string,
  message: string,
): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function normalizeArtifactId(recordId: string, kind: string, index: number, artifact: Omit<ContinuousLearningArtifact, "id"> & { id?: string | null }): string {
  const explicitId = artifact.id === null || artifact.id === undefined ? "" : normalizeContinuousLearningText(artifact.id);
  if (explicitId.length > 0) {
    return normalizeContinuousLearningId(explicitId);
  }

  const digest = hashContinuousLearningValue({
    recordId,
    kind,
    index,
    version: artifact.version,
    title: artifact.title,
    description: artifact.description,
    confidence: clampContinuousLearningConfidence(artifact.confidence),
    sourceIds: artifact.sourceIds,
  }).slice(0, 16);
  return `cl_${normalizeContinuousLearningId(kind)}_${digest}`;
}

function normalizeArtifactList(recordId: string, kind: string, artifacts: readonly ContinuousLearningArtifact[]): readonly ContinuousLearningArtifact[] {
  const normalized = artifacts.map((artifact, index) => {
    const parsed = ContinuousLearningArtifactSchema.parse({
      ...artifact,
      id: artifact.id ?? "",
      version: normalizeContinuousLearningText(artifact.version),
      title: normalizeContinuousLearningText(artifact.title),
      description: normalizeContinuousLearningText(artifact.description),
      confidence: clampContinuousLearningConfidence(artifact.confidence),
      sourceIds: uniqueSortedContinuousLearningStrings(artifact.sourceIds),
    });

    return Object.freeze({
      ...parsed,
      id: normalizeArtifactId(recordId, kind, index, parsed),
      version: normalizeContinuousLearningText(parsed.version),
      confidence: clampContinuousLearningConfidence(parsed.confidence),
      sourceIds: Object.freeze([...parsed.sourceIds]),
    });
  });

  return Object.freeze(normalized.sort((left, right) => left.id.localeCompare(right.id)));
}

export function deriveContinuousLearningRecordId(record: Omit<ContinuousLearningRecord, "id" | "artifacts"> & { artifacts: ContinuousLearningArtifacts }): string {
  const digest = hashContinuousLearningValue({
    version: record.version,
    source: record.source,
    date: record.date,
    signalKind: record.signalKind,
    domain: record.domain,
    concepts: record.concepts,
    evidence: record.evidence,
    reasoning: record.reasoning,
    decision: record.decision,
    confidence: clampContinuousLearningConfidence(record.confidence),
    artifacts: {
      lessons: record.artifacts.lessons.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
      cases: record.artifacts.cases.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
      patterns: record.artifacts.patterns.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
      knowledgeUpdates: record.artifacts.knowledgeUpdates.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
      decisionMemories: record.artifacts.decisionMemories.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
      reviewerImprovements: record.artifacts.reviewerImprovements.map((artifact) => ({
        id: artifact.id,
        version: artifact.version,
        title: artifact.title,
        description: artifact.description,
        confidence: clampContinuousLearningConfidence(artifact.confidence),
        sourceIds: artifact.sourceIds,
      })),
    },
    knowledgeAcquisitionRecordIds: record.knowledgeAcquisitionRecordIds,
    reviewerId: record.reviewerId,
    reviewerName: record.reviewerName,
    agreementState: record.agreementState,
    disagreementGroupId: record.disagreementGroupId,
    supersedesId: record.supersedesId,
    supersededById: record.supersededById,
    relatedRecordIds: record.relatedRecordIds,
  }).slice(0, 16);

  return `cl_${normalizeContinuousLearningId(record.signalKind)}_${normalizeContinuousLearningId(record.domain)}_${digest}`;
}

export function normalizeContinuousLearningRecord(record: ContinuousLearningRecord): ContinuousLearningRecord {
  const parsed = ContinuousLearningRecordSchema.parse({
    ...record,
    id: normalizeContinuousLearningText(record.id),
    version: normalizeContinuousLearningText(record.version),
    source: normalizeContinuousLearningText(record.source),
    date: normalizeContinuousLearningText(record.date),
    domain: normalizeContinuousLearningText(record.domain),
    concepts: uniqueSortedContinuousLearningStrings(record.concepts),
    evidence: uniqueSortedContinuousLearningStrings(record.evidence),
    reasoning: uniqueSortedContinuousLearningStrings(record.reasoning),
    decision: normalizeContinuousLearningText(record.decision),
    confidence: clampContinuousLearningConfidence(record.confidence),
    artifacts: record.artifacts,
    knowledgeAcquisitionRecordIds: uniqueSortedContinuousLearningStrings(record.knowledgeAcquisitionRecordIds),
    reviewerId: record.reviewerId === null ? null : record.reviewerId === undefined ? null : normalizeContinuousLearningText(record.reviewerId),
    reviewerName: record.reviewerName === null ? null : record.reviewerName === undefined ? null : normalizeContinuousLearningText(record.reviewerName),
    disagreementGroupId: record.disagreementGroupId === null ? null : record.disagreementGroupId === undefined ? null : normalizeContinuousLearningText(record.disagreementGroupId),
    supersedesId: record.supersedesId === null ? null : record.supersedesId === undefined ? null : normalizeContinuousLearningText(record.supersedesId),
    supersededById: record.supersededById === null ? null : record.supersededById === undefined ? null : normalizeContinuousLearningText(record.supersededById),
    relatedRecordIds: uniqueSortedContinuousLearningStrings(record.relatedRecordIds),
  });

  const artifacts = Object.freeze({
    lessons: normalizeArtifactList("", "lesson", parsed.artifacts.lessons),
    cases: normalizeArtifactList("", "case", parsed.artifacts.cases),
    patterns: normalizeArtifactList("", "pattern", parsed.artifacts.patterns),
    knowledgeUpdates: normalizeArtifactList("", "knowledge_update", parsed.artifacts.knowledgeUpdates),
    decisionMemories: normalizeArtifactList("", "decision_memory", parsed.artifacts.decisionMemories),
    reviewerImprovements: normalizeArtifactList("", "reviewer_improvement", parsed.artifacts.reviewerImprovements),
  });

  const normalizedWithoutId = Object.freeze({
    ...parsed,
    id: "",
    artifacts,
    confidence: clampContinuousLearningConfidence(parsed.confidence),
  });

  return Object.freeze({
    ...normalizedWithoutId,
    id: deriveContinuousLearningRecordId(normalizedWithoutId),
  });
}

function validateArtifactList(
  path: string,
  artifacts: readonly ContinuousLearningArtifact[],
  issues: ContinuousLearningValidationIssue[],
): void {
  if (!Array.isArray(artifacts)) {
    pushIssue(issues, "error", "artifacts.type", path, "must be an array");
    return;
  }

  artifacts.forEach((artifact, index) => {
    if (!normalizeContinuousLearningText(artifact.id).length) {
      pushIssue(issues, "error", "artifact.id", `${path}[${index}].id`, "must be a non-empty string");
    }
    if (!normalizeContinuousLearningText(artifact.version).length) {
      pushIssue(issues, "error", "artifact.version", `${path}[${index}].version`, "must be a non-empty string");
    }
    if (!normalizeContinuousLearningText(artifact.title).length) {
      pushIssue(issues, "error", "artifact.title", `${path}[${index}].title`, "must be a non-empty string");
    }
    if (!normalizeContinuousLearningText(artifact.description).length) {
      pushIssue(issues, "error", "artifact.description", `${path}[${index}].description`, "must be a non-empty string");
    }
    if (!Number.isFinite(artifact.confidence)) {
      pushIssue(issues, "error", "artifact.confidence", `${path}[${index}].confidence`, "must be a finite number");
    }
    if (!Array.isArray(artifact.sourceIds) || artifact.sourceIds.some((item: string) => !normalizeContinuousLearningText(item).length)) {
      pushIssue(issues, "error", "artifact.sourceIds", `${path}[${index}].sourceIds`, "must be an array of non-empty strings");
    }
  });
}

export function validateContinuousLearningRecord(record: ContinuousLearningRecord): ContinuousLearningValidationResult {
  const issues: ContinuousLearningValidationIssue[] = [];

  if (!normalizeContinuousLearningText(record.id).length) pushIssue(issues, "error", "id", "id", "must be a non-empty string");
  if (!normalizeContinuousLearningText(record.version).length) pushIssue(issues, "error", "version", "version", "must be a non-empty string");
  if (!normalizeContinuousLearningText(record.source).length) pushIssue(issues, "error", "source", "source", "must be a non-empty string");
  if (!normalizeContinuousLearningText(record.date).length) pushIssue(issues, "error", "date", "date", "must be a non-empty string");
  if (!normalizeContinuousLearningText(record.domain).length) pushIssue(issues, "error", "domain", "domain", "must be a non-empty string");
  if (!normalizeContinuousLearningText(record.decision).length) pushIssue(issues, "error", "decision", "decision", "must be a non-empty string");
  if (!Number.isFinite(record.confidence)) pushIssue(issues, "error", "confidence", "confidence", "must be a finite number");

  validateArtifactList("artifacts.lessons", record.artifacts.lessons, issues);
  validateArtifactList("artifacts.cases", record.artifacts.cases, issues);
  validateArtifactList("artifacts.patterns", record.artifacts.patterns, issues);
  validateArtifactList("artifacts.knowledgeUpdates", record.artifacts.knowledgeUpdates, issues);
  validateArtifactList("artifacts.decisionMemories", record.artifacts.decisionMemories, issues);
  validateArtifactList("artifacts.reviewerImprovements", record.artifacts.reviewerImprovements, issues);

  const recordHashes = [
    record.id,
    record.version,
    record.source,
    record.date,
    record.signalKind,
    record.domain,
    ...record.concepts,
    ...record.evidence,
    ...record.reasoning,
    record.decision,
    ...record.knowledgeAcquisitionRecordIds,
    ...record.relatedRecordIds,
    ...record.artifacts.lessons.map((artifact) => artifact.id),
    ...record.artifacts.cases.map((artifact) => artifact.id),
    ...record.artifacts.patterns.map((artifact) => artifact.id),
    ...record.artifacts.knowledgeUpdates.map((artifact) => artifact.id),
    ...record.artifacts.decisionMemories.map((artifact) => artifact.id),
    ...record.artifacts.reviewerImprovements.map((artifact) => artifact.id),
  ];

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues),
    hash: hashContinuousLearningValue(recordHashes),
    recordHashes: Object.freeze(recordHashes.map((entry) => hashContinuousLearningValue(entry))),
  });
}

export function validateContinuousLearningRecords(records: readonly ContinuousLearningRecord[]): ContinuousLearningValidationResult {
  const normalizedRecords = records.map((record) => normalizeContinuousLearningRecord(record));
  const issues: ContinuousLearningValidationIssue[] = [];
  const seen = new Set<string>();

  for (const record of normalizedRecords) {
    if (seen.has(record.id)) {
      pushIssue(issues, "error", "id.duplicate", `records[${record.id}]`, `Duplicate continuous learning record: ${record.id}`);
    }
    seen.add(record.id);

    const validation = validateContinuousLearningRecord(record);
    for (const issue of validation.issues) {
      issues.push(issue);
    }
  }

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues),
    hash: hashContinuousLearningValue(normalizedRecords.map((record) => record.id)),
    recordHashes: Object.freeze(normalizedRecords.map((record) => hashContinuousLearningValue(record.id))),
  });
}

export function parseContinuousLearningRecord(input: unknown): ContinuousLearningRecord {
  return normalizeContinuousLearningRecord(ContinuousLearningRecordSchema.parse(input));
}

function normalizeQuery(value: string | null | undefined): string {
  return normalizeContinuousLearningText(value ?? "").toLowerCase();
}

function includesText(haystack: string, needle: string | null | undefined): boolean {
  const normalizedNeedle = normalizeQuery(needle);
  return normalizedNeedle.length > 0 && normalizeQuery(haystack).includes(normalizedNeedle);
}

function scoreRecord(record: ContinuousLearningRecord, query: ContinuousLearningSearchQuery): { score: number; reasons: readonly string[] } {
  const reasons: string[] = [];
  let score = 0;

  const signalKind = normalizeQuery(query.signalKind ?? null);
  if (signalKind.length > 0 && normalizeQuery(record.signalKind).includes(signalKind)) {
    score += 6;
    reasons.push(`signalKind:${signalKind}`);
  }

  const concept = normalizeQuery(query.concept);
  if (concept.length > 0) {
    const matched = record.concepts.some((value) => includesText(value, concept)) || record.artifacts.lessons.some((artifact) => includesText(`${artifact.title} ${artifact.description}`, concept));
    if (!matched) return { score: 0, reasons: [] };
    score += 5;
    reasons.push(`concept:${concept}`);
  }

  const domain = normalizeQuery(query.domain);
  if (domain.length > 0) {
    if (!includesText(record.domain, domain)) return { score: 0, reasons: [] };
    score += 5;
    reasons.push(`domain:${domain}`);
  }

  const source = normalizeQuery(query.source);
  if (source.length > 0) {
    if (!includesText(record.source, source)) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`source:${source}`);
  }

  const lesson = normalizeQuery(query.lesson);
  if (lesson.length > 0) {
    const matched = record.artifacts.lessons.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, lesson));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`lesson:${lesson}`);
  }

  const caseQuery = normalizeQuery(query.case);
  if (caseQuery.length > 0) {
    const matched = record.artifacts.cases.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, caseQuery));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`case:${caseQuery}`);
  }

  const pattern = normalizeQuery(query.pattern);
  if (pattern.length > 0) {
    const matched = record.artifacts.patterns.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, pattern));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`pattern:${pattern}`);
  }

  const knowledgeUpdate = normalizeQuery(query.knowledgeUpdate);
  if (knowledgeUpdate.length > 0) {
    const matched = record.artifacts.knowledgeUpdates.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, knowledgeUpdate));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`knowledgeUpdate:${knowledgeUpdate}`);
  }

  const decisionMemory = normalizeQuery(query.decisionMemory);
  if (decisionMemory.length > 0) {
    const matched = record.artifacts.decisionMemories.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, decisionMemory));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`decisionMemory:${decisionMemory}`);
  }

  const reviewerImprovement = normalizeQuery(query.reviewerImprovement);
  if (reviewerImprovement.length > 0) {
    const matched = record.artifacts.reviewerImprovements.some((artifact) => includesText(`${artifact.id} ${artifact.title} ${artifact.description} ${artifact.sourceIds.join(" ")}`, reviewerImprovement));
    if (!matched) return { score: 0, reasons: [] };
    score += 4;
    reasons.push(`reviewerImprovement:${reviewerImprovement}`);
  }

  const reviewerId = normalizeQuery(query.reviewerId);
  if (reviewerId.length > 0) {
    if (!includesText(record.reviewerId ?? "", reviewerId)) return { score: 0, reasons: [] };
    score += 3;
    reasons.push(`reviewerId:${reviewerId}`);
  }

  const disagreementGroupId = normalizeQuery(query.disagreementGroupId);
  if (disagreementGroupId.length > 0) {
    if (!includesText(record.disagreementGroupId ?? "", disagreementGroupId)) return { score: 0, reasons: [] };
    score += 3;
    reasons.push(`disagreementGroupId:${disagreementGroupId}`);
  }

  const keyword = normalizeQuery(query.keyword);
  if (keyword.length > 0) {
    const corpus = [
      record.id,
      record.version,
      record.source,
      record.date,
      record.signalKind,
      record.domain,
      record.decision,
      record.reviewerId ?? "",
      record.reviewerName ?? "",
      record.agreementState,
      record.disagreementGroupId ?? "",
      record.supersedesId ?? "",
      record.supersededById ?? "",
      ...record.concepts,
      ...record.evidence,
      ...record.reasoning,
      ...record.knowledgeAcquisitionRecordIds,
      ...record.relatedRecordIds,
      ...record.artifacts.lessons.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
      ...record.artifacts.cases.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
      ...record.artifacts.patterns.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
      ...record.artifacts.knowledgeUpdates.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
      ...record.artifacts.decisionMemories.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
      ...record.artifacts.reviewerImprovements.flatMap((artifact) => [artifact.id, artifact.title, artifact.description, ...artifact.sourceIds]),
    ].join(" ");
    if (!normalizeQuery(corpus).includes(keyword)) return { score: 0, reasons: [] };
    score += 2;
    reasons.push(`keyword:${keyword}`);
  }

  return {
    score,
    reasons: Object.freeze([...new Set(reasons)].sort((left, right) => left.localeCompare(right))),
  };
}

function computeValidation(records: readonly ContinuousLearningRecord[]): ContinuousLearningValidationResult {
  return validateContinuousLearningRecords(records);
}

export function createContinuousLearningRegistry(entries: readonly ContinuousLearningRecord[] = []): ContinuousLearningRegistry {
  const recordsMap = new Map<string, ContinuousLearningRecord>();
  for (const entry of entries) {
    const normalized = normalizeContinuousLearningRecord(entry);
    recordsMap.set(normalized.id, normalized);
  }

  const refresh = (): ContinuousLearningValidationResult => computeValidation(list());

  const list = (): readonly ContinuousLearningRecord[] =>
    Object.freeze([...recordsMap.values()].sort((left, right) => left.id.localeCompare(right.id)));

  let validation = refresh();
  let hash = hashContinuousLearningValue({ records: list().map((record) => record.id), validation });

  const refreshState = (): void => {
    validation = refresh();
    hash = hashContinuousLearningValue({ records: list().map((record) => record.id), validation });
  };

  return Object.freeze({
    get records() {
      return list();
    },
    get validation() {
      return validation;
    },
    get hash() {
      return hash;
    },
    list,
    get: (id: string) => recordsMap.get(normalizeContinuousLearningId(id)) ?? null,
    register: (record: ContinuousLearningRecord) => {
      const normalized = normalizeContinuousLearningRecord(record);
      recordsMap.set(normalized.id, normalized);
      refreshState();
      return createContinuousLearningRegistry(list());
    },
    unregister: (id: string) => {
      const deleted = recordsMap.delete(normalizeContinuousLearningId(id));
      if (deleted) {
        refreshState();
      }
      return deleted;
    },
    search: (query: ContinuousLearningSearchQuery) =>
      Object.freeze(
        list()
          .map((record) => {
            const scored = scoreRecord(record, query);
            return Object.freeze({
              record,
              score: scored.score,
              reasons: scored.reasons,
            }) as ContinuousLearningSearchResult;
          })
          .filter((result) => result.score > 0)
          .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id)),
      ),
  });
}

export function createDefaultContinuousLearningRegistry(): ContinuousLearningRegistry {
  return createContinuousLearningRegistry();
}
