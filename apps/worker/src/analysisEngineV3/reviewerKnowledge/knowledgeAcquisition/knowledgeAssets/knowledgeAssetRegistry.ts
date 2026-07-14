import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadDecisionRecordsFromDirectory } from "../../decisionRecords/decisionRecordLoader.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../../lessons/lessonLoader.js";
import { loadPatternLibraryDocuments } from "../../patternLibraries/patternLibraryLoader.js";
import { parseReviewerKnowledgeDocumentText } from "../../reviewerKnowledgeIO.js";
import { extractKnowledgeAcquisitionRecord, loadKnowledgeAcquisitionRecordsFromDirectory } from "../extractors/knowledgeAcquisitionExtractor.js";
import { hashKnowledgeAcquisitionValue } from "../schema/knowledgeAcquisitionSchema.js";
import { normalizeKnowledgeAcquisitionText } from "../schema/knowledgeAcquisitionVersioning.js";
import { validateKnowledgeAcquisitionRecords } from "../schema/knowledgeAcquisitionValidator.js";
import type {
  KnowledgeAcquisitionRecord,
  KnowledgeAcquisitionRegistry,
  KnowledgeAcquisitionSearchQuery,
  KnowledgeAcquisitionSearchResult,
} from "../schema/knowledgeAcquisitionTypes.js";

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function normalizeQuery(value: string | null | undefined): string {
  return normalizeKnowledgeAcquisitionText(value ?? "").toLowerCase();
}

function collectBenchmarkIds(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const ids: string[] = [];
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !isDirectory(current)) continue;
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || !/\.(?:json|ya?ml)$/i.test(entry.name)) continue;
      const parsed = parseReviewerKnowledgeDocumentText(readFileSync(fullPath, "utf8")) as Record<string, unknown>;
      const cases = Array.isArray(parsed.cases) ? parsed.cases : [];
      for (const candidate of cases) {
        if (candidate && typeof candidate === "object" && "id" in candidate && typeof (candidate as Record<string, unknown>).id === "string") {
          ids.push(normalizeKnowledgeAcquisitionText((candidate as Record<string, string>).id));
        }
      }
    }
  }
  return Object.freeze([...new Set(ids)].sort(compareStrings));
}

function scoreMatch(record: KnowledgeAcquisitionRecord, query: KnowledgeAcquisitionSearchQuery): KnowledgeAcquisitionSearchResult | null {
  const reasons: string[] = [];
  let score = 0;

  const concept = normalizeQuery(query.concept);
  if (concept.length > 0) {
    const matched = record.concepts.some((value) => normalizeQuery(value).includes(concept));
    if (!matched) return null;
    score += 5;
    reasons.push(`concept:${concept}`);
  }

  const domain = normalizeQuery(query.domain);
  if (domain.length > 0) {
    if (!normalizeQuery(record.domain).includes(domain)) return null;
    score += 5;
    reasons.push(`domain:${domain}`);
  }

  const knowledgeType = normalizeQuery(query.knowledgeType);
  if (knowledgeType.length > 0) {
    if (!normalizeQuery(record.knowledgeType).includes(knowledgeType)) return null;
    score += 5;
    reasons.push(`knowledgeType:${knowledgeType}`);
  }

  const source = normalizeQuery(query.source);
  if (source.length > 0) {
    if (!normalizeQuery(record.source).includes(source)) return null;
    score += 4;
    reasons.push(`source:${source}`);
  }

  const lesson = normalizeQuery(query.lesson);
  if (lesson.length > 0) {
    const matched = record.relatedLessons.some((value) => normalizeQuery(value).includes(lesson));
    if (!matched) return null;
    score += 4;
    reasons.push(`lesson:${lesson}`);
  }

  const pattern = normalizeQuery(query.pattern);
  if (pattern.length > 0) {
    const matched = record.relatedPatterns.some((value) => normalizeQuery(value).includes(pattern));
    if (!matched) return null;
    score += 4;
    reasons.push(`pattern:${pattern}`);
  }

  const decisionRecord = normalizeQuery(query.decisionRecord);
  if (decisionRecord.length > 0) {
    const matched = record.relatedDecisionRecords.some((value) => normalizeQuery(value).includes(decisionRecord));
    if (!matched) return null;
    score += 4;
    reasons.push(`decisionRecord:${decisionRecord}`);
  }

  const benchmark = normalizeQuery(query.benchmark);
  if (benchmark.length > 0) {
    const matched = record.relatedBenchmarks.some((value) => normalizeQuery(value).includes(benchmark));
    if (!matched) return null;
    score += 4;
    reasons.push(`benchmark:${benchmark}`);
  }

  const reviewerId = normalizeQuery(query.reviewerId);
  if (reviewerId.length > 0) {
    if (!normalizeQuery(record.reviewerId).includes(reviewerId)) return null;
    score += 3;
    reasons.push(`reviewerId:${reviewerId}`);
  }

  const disagreementGroupId = normalizeQuery(query.disagreementGroupId);
  if (disagreementGroupId.length > 0) {
    if (!normalizeQuery(record.disagreementGroupId).includes(disagreementGroupId)) return null;
    score += 3;
    reasons.push(`disagreementGroupId:${disagreementGroupId}`);
  }

  const keyword = normalizeQuery(query.keyword);
  if (keyword.length > 0) {
    const corpus = normalizeQuery([
      record.id,
      record.version,
      record.source,
      record.date,
      record.knowledgeType,
      record.domain,
      record.storyContext,
      record.decision,
      record.knowledgeDebtReference,
      ...record.concepts,
      ...record.evidence,
      ...record.reasoning,
      ...record.alternativeDecisions,
      ...record.rejectedInterpretations,
      ...record.futureReviewNotes,
    ].join(" "));
    if (!corpus.includes(keyword)) return null;
    score += 2;
    reasons.push(`keyword:${keyword}`);
  }

  return Object.freeze({
    record,
    score,
    reasons: Object.freeze(reasons.sort((left, right) => left.localeCompare(right))),
  });
}

export class KnowledgeAssetRegistry {
  private readonly recordsMap = new Map<string, KnowledgeAcquisitionRecord>();
  readonly rootDir: string | null;
  private validationState: ReturnType<typeof validateKnowledgeAcquisitionRecords>;
  private hashState: string;

  constructor(entries: readonly KnowledgeAcquisitionRecord[] = [], rootDir: string | null = null) {
    this.rootDir = rootDir;
    for (const entry of entries) {
      this.recordsMap.set(entry.id, extractKnowledgeAcquisitionRecord(entry));
    }
    this.validationState = validateKnowledgeAcquisitionRecords(this.list(), rootDir ? { rootDir } : {});
    this.hashState = hashKnowledgeAcquisitionValue(this.list().map((record) => record.id).sort((left, right) => left.localeCompare(right)));
  }

  get validation() {
    return this.validationState;
  }

  get hash() {
    return this.hashState;
  }

  get records(): readonly KnowledgeAcquisitionRecord[] {
    return this.list();
  }

  private refreshState(): void {
    const records = this.list();
    this.validationState = validateKnowledgeAcquisitionRecords(records, this.rootDir ? { rootDir: this.rootDir } : {});
    this.hashState = hashKnowledgeAcquisitionValue(records.map((record) => record.id).sort((left, right) => left.localeCompare(right)));
  }

  list(): readonly KnowledgeAcquisitionRecord[] {
    return Object.freeze([...this.recordsMap.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }

  get(id: string): KnowledgeAcquisitionRecord | null {
    return this.recordsMap.get(normalizeKnowledgeAcquisitionText(id)) ?? null;
  }

  register(record: KnowledgeAcquisitionRecord): KnowledgeAssetRegistry {
    const normalized = extractKnowledgeAcquisitionRecord(record);
    this.recordsMap.set(normalized.id, normalized);
    this.refreshState();
    return this;
  }

  unregister(id: string): boolean {
    const deleted = this.recordsMap.delete(normalizeKnowledgeAcquisitionText(id));
    if (deleted) {
      this.refreshState();
    }
    return deleted;
  }

  search(query: KnowledgeAcquisitionSearchQuery): readonly KnowledgeAcquisitionSearchResult[] {
    return Object.freeze(
      this.list()
        .map((record) => scoreMatch(record, query))
        .filter((result): result is KnowledgeAcquisitionSearchResult => result !== null)
        .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id)),
    );
  }
}

export function createKnowledgeAssetRegistry(entries: readonly KnowledgeAcquisitionRecord[] = [], rootDir: string | null = null): KnowledgeAssetRegistry {
  return new KnowledgeAssetRegistry(entries, rootDir);
}

export function createKnowledgeAssetRegistryFromDirectory(directoryPath: string): KnowledgeAssetRegistry {
  return new KnowledgeAssetRegistry(loadKnowledgeAcquisitionRecordsFromDirectory(directoryPath), directoryPath);
}

export function discoverKnowledgeAssetReferences(rootDir: string): readonly string[] {
  const lessonIds = loadReviewerKnowledgeLessonsFromDirectory(join(rootDir, "..", "lessons")).map((lesson) => lesson.id);
  const patternIds = loadPatternLibraryDocuments(join(rootDir, "..", "patternLibraries")).flatMap((document) => document.entries.map((entry) => entry.id));
  const decisionIds = loadDecisionRecordsFromDirectory(join(rootDir, "..", "decisionRecords", "examples")).map((record) => record.id);
  const benchmarkIds = collectBenchmarkIds(join(rootDir, "..", "benchmarks"));
  return Object.freeze([...new Set([...lessonIds, ...patternIds, ...decisionIds, ...benchmarkIds])].sort(compareStrings));
}
