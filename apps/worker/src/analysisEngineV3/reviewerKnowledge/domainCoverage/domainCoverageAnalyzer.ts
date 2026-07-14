import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { createBenchmarkValidator } from "../../benchmark/benchmarkValidator.js";
import type { BenchmarkCase } from "../../benchmark/benchmarkTypes.js";
import { getDefaultReviewerMethodology } from "../../reviewerMethodology/reviewerMethodologyRegistry.js";
import { loadReviewerKnowledgeLessonDocumentFromText } from "../lessons/lessonLoader.js";
import { loadDecisionRecordsFromDirectory } from "../decisionRecords/decisionRecordLoader.js";
import { validateDecisionRecords } from "../decisionRecords/decisionRecordValidator.js";
import { loadPatternLibraryDocumentsFromDirectory } from "../patternLibraries/patternLibraryValidator.js";
import { validatePatternLibraryDocument } from "../patternLibraries/patternLibraryValidator.js";
import { parseReviewerAcademyPackDocumentText } from "../academy/reviewerAcademyIndex.js";
import { validateBlueprints } from "../blueprints/blueprintValidator.js";
import { parseReviewerKnowledgeDocumentText } from "../reviewerKnowledgeIO.js";
import { validateReviewerKnowledgePack } from "../reviewerKnowledgeValidator.js";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import type { ReviewerKnowledgeLesson } from "../lessons/lessonTypes.js";
import type { BlueprintDocument } from "../blueprints/blueprintTypes.js";
import type { PatternLibraryDocument } from "../patternLibraries/patternLibraryTypes.js";
import type { DecisionRecord } from "../decisionRecords/decisionRecordTypes.js";
import type { DomainCoverageMetrics, DomainCoverageReport, DomainCoverageSection, DomainCoverageTopicMetric } from "./domainCoverageTypes.js";
import { computeDomainProductionReadiness, createDomainCoverageMetrics, createDomainCoverageSection, createDomainCoverageTopicMetric } from "./domainCoverageMetrics.js";

const BLUEPRINT_FILES = Object.freeze([
  "domain.json",
  "concepts.json",
  "actions.json",
  "targets.json",
  "contexts.json",
  "intents.json",
  "evidence.json",
  "relationships.json",
  "reviewQuestions.json",
]);

const NON_DOMAIN_FOLDERS = Object.freeze(["examples", "universal", "glossary"]);
const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort((left, right) => left.localeCompare(right)).map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

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

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort(compareStrings));
}

function pathToText(path: string): string {
  return normalizeText(path.split("\\").join("/"));
}

function fileExists(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function discoverFiles(rootDir: string, predicate: (fileName: string) => boolean): readonly string[] {
  if (!isDirectory(rootDir)) {
    return Object.freeze([]);
  }

  const files: string[] = [];
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !isDirectory(current)) {
      continue;
    }

    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (predicate(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return Object.freeze(files.sort(compareStrings));
}

function discoverDomainIds(rootDir: string): readonly string[] {
  const folders = new Set<string>();
  const roots = [
    join(rootDir, "blueprints"),
    join(rootDir, "academy"),
    join(rootDir, "patternLibraries"),
    join(rootDir, "decisionRecords", "examples"),
    join(rootDir, "benchmarks"),
    join(rootDir, "reasoning"),
  ];

  for (const domainRoot of roots) {
    if (!isDirectory(domainRoot)) continue;
    for (const entry of readdirSync(domainRoot, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isDirectory()) continue;
      const folder = normalizeText(entry.name);
      if (!NON_DOMAIN_FOLDERS.includes(folder)) {
        folders.add(folder);
      }
    }
  }

  return Object.freeze([...folders].sort(compareStrings));
}

function resolveDomainArtifactDirectory(rootDir: string, domainId: string, ...segments: string[]): string {
  const standardPath = join(rootDir, ...segments, domainId);
  if (isDirectory(standardPath)) {
    return standardPath;
  }

  const reasoningPath = join(rootDir, "reasoning", domainId, ...segments);
  if (isDirectory(reasoningPath)) {
    return reasoningPath;
  }

  return reasoningPath;
}

function buildCorpus(values: readonly unknown[]): string {
  return normalizeText(values.map((value) => stableSerialize(value)).join("\n"));
}

function lessonNumberFromText(value: string): number | null {
  const match = normalizeText(value).match(/lesson[_-](\d{1,3})/);
  if (!match) {
    return null;
  }
  const number = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function collectTextAliases(value: unknown, aliases: Set<string>): void {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    if (normalized.length > 0) {
      aliases.add(normalized);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextAliases(item, aliases);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      collectTextAliases(nested, aliases);
    }
  }
}

function collectAliasCandidates(entry: Record<string, unknown>): readonly string[] {
  const aliases = new Set<string>();
  collectTextAliases(entry, aliases);
  return Object.freeze([...aliases].filter(Boolean));
}

function countCoveredEntries(entries: readonly Record<string, unknown>[], corpus: string): { present: number; missing: readonly string[]; evidence: readonly string[] } {
  const missing: string[] = [];
  const evidence: string[] = [];
  let present = 0;

  for (const entry of entries) {
    const aliases = collectAliasCandidates(entry);
    const matched = aliases.find((alias) => alias.length > 0 && corpus.includes(alias));
    if (matched) {
      present += 1;
      evidence.push(matched);
      continue;
    }

    const identifier = typeof entry.id === "string" ? entry.id : typeof entry.title === "string" ? entry.title : stableSerialize(entry).slice(0, 40);
    missing.push(identifier);
  }

  return {
    present,
    missing: sortedUnique(missing),
    evidence: sortedUnique(evidence),
  };
}

const countCovered = countCoveredEntries;

function loadBlueprintDocuments(domainRoot: string): readonly BlueprintDocument[] {
  if (!isDirectory(domainRoot)) {
    return Object.freeze([]);
  }

  const documents: BlueprintDocument[] = [];
  for (const fileName of BLUEPRINT_FILES) {
    const filePath = join(domainRoot, fileName);
    if (!fileExists(filePath)) {
      continue;
    }
    const parsed = parseReviewerKnowledgeDocumentText(readFileSync(filePath, "utf8")) as BlueprintDocument;
    documents.push(Object.freeze(parsed));
  }

  return Object.freeze(documents);
}

function loadAcademyPack(domainRoot: string): { document: { metadata: { id: string; version: { major: number; minor: number; patch: number }; title: string; description: string; supported_concepts: readonly string[] }; pack: ReviewerKnowledgePack | null } | null; filePath: string | null } {
  const candidates = ["pack.v1.json", "pack.v1.yaml", "pack.v1.yml"].map((fileName) => join(domainRoot, fileName)).filter((filePath) => fileExists(filePath));
  if (candidates.length === 0) {
    return { document: null, filePath: null };
  }

  const filePath = candidates.sort(compareStrings)[0] ?? null;
  if (!filePath) {
    return { document: null, filePath: null };
  }

  const parsed = parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8"));
  return { document: parsed, filePath };
}

type LoadedLessonSource = Readonly<{
  lesson: ReviewerKnowledgeLesson;
  sourceFile: string;
  example: boolean;
}>;

function loadLessonsFromDirectory(rootDir: string, baseDir: string, example = false): readonly LoadedLessonSource[] {
  if (!isDirectory(rootDir)) {
    return Object.freeze([]);
  }

  const filePattern = /^lesson.*\.v\d+\.(?:json|ya?ml)$/i;
  const files = discoverFiles(rootDir, (fileName) => filePattern.test(fileName));
  const lessons: LoadedLessonSource[] = [];

  for (const filePath of files) {
    const lessonDocument = loadReviewerKnowledgeLessonDocumentFromText(readFileSync(filePath, "utf8"));
    lessons.push(Object.freeze({
      lesson: lessonDocument.lesson,
      sourceFile: pathToText(relative(baseDir, filePath)),
      example,
    }));
  }

  return Object.freeze(lessons.sort((left, right) =>
    left.lesson.id.localeCompare(right.lesson.id) ||
    left.sourceFile.localeCompare(right.sourceFile),
  ));
}

function loadDomainLessons(rootDir: string, domainId: string): readonly LoadedLessonSource[] {
  const lessonsRoots = [
    join(rootDir, "lessons"),
    join(rootDir, "reasoning", domainId, "lessons"),
  ].filter(isDirectory);
  const production = [
    ...lessonsRoots.flatMap((lessonsRoot) => [
      loadLessonsFromDirectory(join(lessonsRoot, "universal"), lessonsRoot, false),
      loadLessonsFromDirectory(join(lessonsRoot, domainId), lessonsRoot, false),
    ]),
  ].flat();

  const example = lessonsRoots.flatMap((lessonsRoot) => loadLessonsFromDirectory(join(lessonsRoot, "examples", domainId), lessonsRoot, true));

  return Object.freeze([...production, ...example].sort((left, right) => left.lesson.id.localeCompare(right.lesson.id) || left.sourceFile.localeCompare(right.sourceFile)));
}

function loadDecisionRecords(rootDir: string, domainId: string): readonly DecisionRecord[] {
  return loadDecisionRecordsFromDirectory(resolveDomainArtifactDirectory(rootDir, domainId, "decisionRecords", "examples"));
}

function loadPatternLibraries(rootDir: string, domainId: string): readonly PatternLibraryDocument[] {
  return loadPatternLibraryDocumentsFromDirectory(resolveDomainArtifactDirectory(rootDir, domainId, "patternLibraries"));
}

function loadBenchmarkCases(rootDir: string, domainId: string): readonly BenchmarkCase[] {
  const benchmarkRoot = resolveDomainArtifactDirectory(rootDir, domainId, "benchmarks");
  if (!isDirectory(benchmarkRoot)) {
    return Object.freeze([]);
  }

  const files = discoverFiles(benchmarkRoot, (fileName) => fileName.toLowerCase().endsWith(".json") || fileName.toLowerCase().endsWith(".yaml") || fileName.toLowerCase().endsWith(".yml"));
  const cases: BenchmarkCase[] = [];

  for (const filePath of files) {
    const parsed = parseReviewerKnowledgeDocumentText(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const values = Array.isArray(parsed.cases) ? parsed.cases : [];
    for (const value of values) {
      if (value && typeof value === "object") {
        cases.push(value as BenchmarkCase);
      }
    }
  }

  return Object.freeze(cases.sort((left, right) => left.id.localeCompare(right.id)));
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

function getBlueprintConceptEntries(documents: readonly BlueprintDocument[]): readonly Record<string, unknown>[] {
  const conceptDoc = documents.find((document) => document.id.includes("concept"));
  if (!conceptDoc) {
    return Object.freeze([]);
  }
  return Object.freeze((Array.isArray(conceptDoc.entries) ? conceptDoc.entries : []).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null));
}

function getBlueprintTopicEntries(documents: readonly BlueprintDocument[], fileName: string): readonly Record<string, unknown>[] {
  const document = documents.find((candidate) => normalizeText(candidate.id).includes(normalizeText(fileName.replace(/\.json$/i, ""))));
  if (!document) {
    return Object.freeze([]);
  }
  return Object.freeze((Array.isArray(document.entries) ? document.entries : []).filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null));
}

function flattenBlueprintCorpus(documents: readonly BlueprintDocument[]): string {
  return buildCorpus(documents);
}

function flattenCorpus(values: readonly unknown[]): string {
  return buildCorpus(values);
}

function buildLessonCoverage(lessons: readonly LoadedLessonSource[]): DomainCoverageSection {
  const productionLessons = lessons.filter((entry) => !entry.example);
  const lessonNumbers = productionLessons
    .map((entry) => lessonNumberFromText(entry.lesson.id) ?? lessonNumberFromText(entry.sourceFile))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort(compareNumbers);

  const uniqueLessonNumbers = [...new Set(lessonNumbers)];
  const expected = uniqueLessonNumbers.length > 0 ? Math.max(...uniqueLessonNumbers) : 0;
  const missing: string[] = [];
  if (expected > 0) {
    const observed = new Set(uniqueLessonNumbers);
    for (let number = 1; number <= expected; number += 1) {
      if (!observed.has(number)) {
        missing.push(`lesson_${String(number).padStart(3, "0")}`);
      }
    }
  }

  const notes = lessons.some((entry) => entry.example)
    ? [`example lessons detected: ${lessons.filter((entry) => entry.example).length}`]
    : [];

  return createDomainCoverageSection(
    "Lessons",
    uniqueLessonNumbers.length,
    expected,
    missing,
    [],
    notes,
  );
}

function buildArtifactCoverageSection(title: string, presentDocuments: number, expectedDocuments: number, coverageMissing: readonly string[] = [], warnings: readonly string[] = [], notes: readonly string[] = []): DomainCoverageSection {
  return createDomainCoverageSection(title, presentDocuments, expectedDocuments, coverageMissing, warnings, notes);
}

function buildTopicMetrics(
  domainCorpora: Readonly<{
    blueprint: string;
    pack: string;
    lessons: string;
    patterns: string;
    decisionRecords: string;
    benchmarks: string;
    all: string;
  }>,
  blueprints: readonly BlueprintDocument[],
  pack: { document: { metadata: { supported_concepts: readonly string[] }; pack: ReviewerKnowledgePack | null } | null; filePath: string | null },
  lessons: readonly LoadedLessonSource[],
  patterns: readonly PatternLibraryDocument[],
  decisionRecords: readonly DecisionRecord[],
  benchmarkCases: readonly BenchmarkCase[],
): readonly DomainCoverageTopicMetric[] {
  const concepts = getBlueprintConceptEntries(blueprints);
  const contexts = getBlueprintTopicEntries(blueprints, "contexts.json");
  const targets = getBlueprintTopicEntries(blueprints, "targets.json");
  const actions = getBlueprintTopicEntries(blueprints, "actions.json");
  const intents = getBlueprintTopicEntries(blueprints, "intents.json");
  const relationships = getBlueprintTopicEntries(blueprints, "relationships.json");
  const evidence = getBlueprintTopicEntries(blueprints, "evidence.json");

  const lessonCorpus = domainCorpora.lessons;
  const allCorpus = domainCorpora.all;
  const packCorpus = domainCorpora.pack;
  const patternCorpus = domainCorpora.patterns;
  const decisionCorpus = domainCorpora.decisionRecords;
  const benchmarkCorpus = domainCorpora.benchmarks;

  const packConcepts = pack.document?.metadata.supported_concepts ?? [];
  const packConceptMetric = countCovered(packConcepts.map((concept) => ({ id: concept, title: concept, description: concept })), packCorpus);
  const conceptMetric = countCovered(concepts, allCorpus);
  const contextsMetric = countCovered(contexts, allCorpus);
  const targetsMetric = countCovered(targets, allCorpus);
  const actionsMetric = countCovered(actions, allCorpus);
  const intentsMetric = countCovered(intents, allCorpus);
  const relationshipsMetric = countCovered(relationships, allCorpus);
  const evidenceMetric = countCovered(evidence, allCorpus);

  const lessonQuestions = lessons.flatMap((lesson) => lesson.lesson.reviewerQuestions.map((question) => question.id));
  const lessonQuestionEntries = lessonQuestions.map((id) => ({ id, title: id, description: id }));
  const reviewerQuestionsMetric = countCovered(lessonQuestionEntries, allCorpus);

  const methodology = getDefaultReviewerMethodology();
  const methodologyMetric = createDomainCoverageTopicMetric(
    methodology.id,
    methodology.title,
    methodology.stages.length,
    methodology.stages.length,
    methodology.stages.map((stage) => stage.title),
    [],
  );

  const gcamIds = new Set<number>();
  const packMappings = pack.document?.pack?.article_mapping ?? [];
  for (const mapping of packMappings) {
    gcamIds.add(mapping.article_id);
  }
  for (const pattern of patterns) {
    for (const entry of pattern.entries) {
      for (const mapping of entry.gcam_mappings) {
        gcamIds.add(mapping.article_id);
      }
    }
  }
  for (const record of decisionRecords) {
    for (const mapping of record.gcamMappings) {
      gcamIds.add(mapping.article_id);
    }
  }
  for (const benchmarkCase of benchmarkCases) {
    for (const articleId of benchmarkCase.expectedArticleMapping) {
      gcamIds.add(articleId);
    }
  }
  const gcamCovered = [...gcamIds].filter((articleId) => allCorpus.includes(String(articleId))).length;

  const crossSentence = allCorpus.includes("cross-sentence") || allCorpus.includes("cross sentence") || benchmarkCases.some((benchmarkCase) => benchmarkCase.neighboringSentences.length > 0);
  const crossScene = allCorpus.includes("cross-scene") || allCorpus.includes("scene") || lessons.some((lesson) => lesson.lesson.summary.toLowerCase().includes("scene"));
  const description = allCorpus.includes("description") || allCorpus.includes("scene description");
  const dialogue = allCorpus.includes("dialogue") || benchmarkCases.some((benchmarkCase) => benchmarkCase.scriptSnippet.includes(":")) || lessons.some((lesson) => lesson.lesson.reviewerQuestions.some((question) => question.id.includes("speaker")));
  const observation = allCorpus.includes("observation") || benchmarkCases.some((benchmarkCase) => benchmarkCase.expectedFinding.disposition === "reject");

  const conceptCoverage = createDomainCoverageTopicMetric(
    "concepts",
    "Concept Coverage",
    conceptMetric.present,
    concepts.length,
    conceptMetric.evidence,
    conceptMetric.missing,
  );
  const duplicateConceptCoverage = createDomainCoverageTopicMetric(
    "duplicate_concepts",
    "Duplicate Concepts",
    0,
    0,
    [],
    [],
  );
  const missingConceptCoverage = createDomainCoverageTopicMetric(
    "missing_concepts",
    "Missing Concepts",
    concepts.length - conceptMetric.present,
    concepts.length,
    [],
    conceptMetric.missing,
  );

  return Object.freeze([
    conceptCoverage,
    duplicateConceptCoverage,
    missingConceptCoverage,
    createDomainCoverageTopicMetric("missing_pattern_coverage", "Missing Pattern Coverage", concepts.length - countCovered(concepts, patternCorpus).present, concepts.length, [], countCovered(concepts, patternCorpus).missing),
    createDomainCoverageTopicMetric("missing_decision_coverage", "Missing Decision Coverage", concepts.length - countCovered(concepts, decisionCorpus).present, concepts.length, [], countCovered(concepts, decisionCorpus).missing),
    createDomainCoverageTopicMetric("missing_benchmark_coverage", "Missing Benchmark Coverage", concepts.length - countCovered(concepts, benchmarkCorpus).present, concepts.length, [], countCovered(concepts, benchmarkCorpus).missing),
    createDomainCoverageTopicMetric("glossary", "Glossary Coverage", pack.document?.pack?.glossary_relationships.length ?? 0, pack.document?.pack?.glossary_relationships.length ?? 0, pack.document?.pack?.glossary_relationships.map((entry) => entry.term) ?? [], []),
    createDomainCoverageTopicMetric("cross_sentence", "Cross Sentence Coverage", crossSentence ? 1 : 0, 1, crossSentence ? ["cross sentence reasoning"] : [], crossSentence ? [] : ["cross sentence reasoning"]),
    createDomainCoverageTopicMetric("cross_scene", "Cross Scene Coverage", crossScene ? 1 : 0, 1, crossScene ? ["cross scene reasoning"] : [], crossScene ? [] : ["cross scene reasoning"]),
    createDomainCoverageTopicMetric("description", "Description Coverage", description ? 1 : 0, 1, description ? ["description coverage"] : [], description ? [] : ["description coverage"]),
    createDomainCoverageTopicMetric("dialogue", "Dialogue Coverage", dialogue ? 1 : 0, 1, dialogue ? ["dialogue coverage"] : [], dialogue ? [] : ["dialogue coverage"]),
    createDomainCoverageTopicMetric("observation", "Observation Coverage", observation ? 1 : 0, 1, observation ? ["observation coverage"] : [], observation ? [] : ["observation coverage"]),
    createDomainCoverageTopicMetric("contexts", "Contexts Coverage", contextsMetric.present, contexts.length, contextsMetric.evidence, contextsMetric.missing),
    createDomainCoverageTopicMetric("targets", "Targets Coverage", targetsMetric.present, targets.length, targetsMetric.evidence, targetsMetric.missing),
    createDomainCoverageTopicMetric("actions", "Actions Coverage", actionsMetric.present, actions.length, actionsMetric.evidence, actionsMetric.missing),
    createDomainCoverageTopicMetric("intents", "Intents Coverage", intentsMetric.present, intents.length, intentsMetric.evidence, intentsMetric.missing),
    createDomainCoverageTopicMetric("relationships", "Relationships Coverage", relationshipsMetric.present, relationships.length, relationshipsMetric.evidence, relationshipsMetric.missing),
    createDomainCoverageTopicMetric("evidence_rules", "Evidence Rules Coverage", evidenceMetric.present, evidence.length, evidenceMetric.evidence, evidenceMetric.missing),
    createDomainCoverageTopicMetric("exceptions", "Exceptions Coverage", pack.document?.pack?.legal_exceptions.length ?? 0, pack.document?.pack?.legal_exceptions.length ?? 0, pack.document?.pack?.legal_exceptions ?? [], []),
    createDomainCoverageTopicMetric("false_positives", "False Positives Coverage", pack.document?.pack?.common_false_positives.length ?? 0, pack.document?.pack?.common_false_positives.length ?? 0, pack.document?.pack?.common_false_positives ?? [], []),
    createDomainCoverageTopicMetric("false_negatives", "False Negatives Coverage", pack.document?.pack?.negative_examples.length ?? 0, pack.document?.pack?.negative_examples.length ?? 0, pack.document?.pack?.negative_examples ?? [], []),
    createDomainCoverageTopicMetric("reviewer_questions", "Reviewer Questions Coverage", reviewerQuestionsMetric.present, lessonQuestions.length, reviewerQuestionsMetric.evidence, reviewerQuestionsMetric.missing),
    methodologyMetric,
    createDomainCoverageTopicMetric("gcam_mapping", "GCAM Mapping Coverage", gcamCovered, gcamIds.size, [...gcamIds].map((value) => String(value)), [...gcamIds].filter((value) => !allCorpus.includes(String(value))).map((value) => String(value))),
  ]);
}

function buildWarnings(lessons: readonly LoadedLessonSource[], decisionRecords: readonly DecisionRecord[], benchmarkCases: readonly BenchmarkCase[]): readonly string[] {
  const warnings: string[] = [];
  const exampleLessons = lessons.filter((lesson) => lesson.example);
  if (exampleLessons.length > 0) {
    warnings.push(`Example lessons present: ${exampleLessons.length}`);
  }
  if (decisionRecords.length > 0 && decisionRecords.length < 5) {
    warnings.push("Decision record coverage is shallow.");
  }
  if (benchmarkCases.length > 0 && benchmarkCases.length < 10) {
    warnings.push("Benchmark coverage is shallow.");
  }
  return sortedUnique(warnings);
}

function buildCoverageGaps(blueprint: DomainCoverageSection, knowledgePack: DomainCoverageSection, lessons: DomainCoverageSection, patterns: DomainCoverageSection, decisionRecords: DomainCoverageSection, benchmarks: DomainCoverageSection, metrics: readonly DomainCoverageTopicMetric[]): readonly string[] {
  const gaps: string[] = [];
  if (blueprint.coveragePercent < 100 && blueprint.missing.length > 0) gaps.push(...blueprint.missing.map((value) => `Blueprint missing ${value}`));
  if (knowledgePack.coveragePercent < 100 && knowledgePack.missing.length > 0) gaps.push(...knowledgePack.missing.map((value) => `Knowledge pack missing ${value}`));
  if (lessons.coveragePercent < 100 && lessons.missing.length > 0) gaps.push(...lessons.missing.map((value) => `Lesson missing ${value}`));
  if (patterns.coveragePercent < 100 && patterns.missing.length > 0) gaps.push(...patterns.missing.map((value) => `Pattern gap ${value}`));
  if (decisionRecords.coveragePercent < 100 && decisionRecords.missing.length > 0) gaps.push(...decisionRecords.missing.map((value) => `Decision gap ${value}`));
  if (benchmarks.coveragePercent < 100 && benchmarks.missing.length > 0) gaps.push(...benchmarks.missing.map((value) => `Benchmark gap ${value}`));
  for (const metric of metrics) {
    if (metric.coveragePercent < 100 && metric.missing.length > 0 && ["missing_pattern_coverage", "missing_decision_coverage", "missing_benchmark_coverage"].includes(metric.id)) {
      gaps.push(`${metric.title}: ${metric.missing.join(", ")}`);
    }
  }
  return sortedUnique(gaps);
}

function buildCriticalGaps(sections: readonly DomainCoverageSection[], warnings: readonly string[]): readonly string[] {
  const critical: string[] = [];
  for (const section of sections) {
    if (section.coveragePercent < 70) {
      critical.push(`${section.title} coverage below threshold`);
    }
  }
  if (warnings.some((warning) => warning.includes("Example lessons"))) {
    // Example lessons are not critical by themselves.
  }
  return sortedUnique(critical);
}

function renderDomainTitle(domainId: string, blueprintDocuments: readonly BlueprintDocument[], packTitle: string | null): string {
  const domainDoc = blueprintDocuments.find((document) => normalizeText(document.id).includes("domain"));
  const entryTitle = domainDoc && Array.isArray(domainDoc.entries) && domainDoc.entries.length > 0 && typeof domainDoc.entries[0] === "object" && domainDoc.entries[0] !== null && "title" in domainDoc.entries[0] && typeof (domainDoc.entries[0] as Record<string, unknown>).title === "string"
    ? String((domainDoc.entries[0] as Record<string, unknown>).title)
    : null;
  return entryTitle ?? packTitle ?? domainId.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function toSectionHashInput(section: DomainCoverageSection): Omit<DomainCoverageSection, "hash"> {
  const { hash, ...rest } = section;
  return rest;
}

function toReportHashInput(report: DomainCoverageReport): Omit<DomainCoverageReport, "hash"> {
  const { hash, ...rest } = report;
  return rest;
}

export class DomainCoverageAnalyzer {
  constructor(private readonly rootDir = DEFAULT_ROOT) {}

  analyze(domainId: string): DomainCoverageReport {
    const normalizedDomainId = normalizeText(domainId);
    const domainRoot = normalizedDomainId.length > 0 ? normalizedDomainId : domainId;
    const blueprintDir = resolveDomainArtifactDirectory(this.rootDir, domainRoot, "blueprints");
    const blueprints = loadBlueprintDocuments(blueprintDir);
    const blueprintValidation = isDirectory(blueprintDir)
      ? validateBlueprints(blueprintDir)
      : Object.freeze({
          valid: false,
          issues: Object.freeze([]),
          hash: hashValue({ blueprintDir, present: false }),
        });

    const pack = loadAcademyPack(resolveDomainArtifactDirectory(this.rootDir, domainRoot, "academy"));
    const lessons = loadDomainLessons(this.rootDir, domainRoot);
    const patterns = loadPatternLibraries(this.rootDir, domainRoot);
    const decisionRecords = loadDecisionRecords(this.rootDir, domainRoot);
    const benchmarkCases = loadBenchmarkCases(this.rootDir, domainRoot);
    const benchmarkValidator = createBenchmarkValidator();
    const benchmarkValidation = benchmarkValidator.validateCases(benchmarkCases);

    const blueprintSection = buildArtifactCoverageSection(
      "Blueprint",
      blueprints.length,
      BLUEPRINT_FILES.length,
      BLUEPRINT_FILES.filter((file) => !fileExists(join(this.rootDir, "blueprints", domainRoot, file))),
      blueprintValidation.issues.map((issue) => issue.message),
      [blueprintValidation.hash],
    );

    const blueprintConcepts = getBlueprintConceptEntries(blueprints);
    const blueprintCorpus = flattenBlueprintCorpus(blueprints);
    const packCorpus = pack.document?.pack ? flattenCorpus([pack.document.pack, pack.document.metadata]) : "";
    const lessonsCorpus = flattenCorpus(lessons.map((lesson) => lesson.lesson));
    const patternCorpus = flattenCorpus(patterns);
    const decisionCorpus = flattenCorpus(decisionRecords);
    const benchmarkCorpus = flattenCorpus(benchmarkCases);
    const allCorpus = buildCorpus([blueprints, pack.document, lessons, patterns, decisionRecords, benchmarkCases]);

    const packConceptCoverage = countCovered(blueprintConcepts, packCorpus);
    const patternsConceptCoverage = countCovered(blueprintConcepts, patternCorpus);
    const decisionsConceptCoverage = countCovered(blueprintConcepts, decisionCorpus);
    const benchmarkConceptCoverage = countCovered(blueprintConcepts, benchmarkCorpus);

    const knowledgePackSection = buildArtifactCoverageSection(
      "Knowledge Pack",
      pack.document?.pack ? packConceptCoverage.present : 0,
      blueprintConcepts.length,
      packConceptCoverage.missing,
      pack.document?.pack ? validateReviewerKnowledgePack(pack.document.pack).issues.map((issue) => issue.message) : ["Knowledge pack missing."],
      pack.document ? [pack.document.metadata.title, `pack=${pack.filePath ?? "unknown"}`] : ["No academy pack present."],
    );

    const lessonsSection = buildLessonCoverage(lessons);
    const patternsSection = buildArtifactCoverageSection(
      "Patterns",
      patterns.length > 0 ? patternsConceptCoverage.present : 0,
      blueprintConcepts.length,
      patternsConceptCoverage.missing,
      patterns.flatMap((pattern) => validatePatternLibraryDocument(pattern).issues.map((issue) => issue.message)),
      [patterns.length > 0 ? `${patterns.length} pattern library documents loaded` : "No pattern libraries found."],
    );

    const decisionRecordsValidation = validateDecisionRecords(decisionRecords, { rootDir: resolveDomainArtifactDirectory(this.rootDir, domainRoot, "decisionRecords", "examples") });
    const decisionRecordsSection = buildArtifactCoverageSection(
      "Decision Records",
      decisionRecords.length > 0 ? 1 : 0,
      1,
      decisionRecords.length > 0 ? [] : ["decision records missing"],
      decisionRecordsValidation.issues.map((issue) => issue.message),
      [decisionRecords.length > 0 ? `${decisionRecords.length} decision records loaded` : "No decision records found."],
    );

    const benchmarksSection = buildArtifactCoverageSection(
      "Benchmarks",
      benchmarkCases.length > 0 ? 1 : 0,
      1,
      benchmarkCases.length > 0 ? [] : ["benchmark catalog missing"],
      benchmarkValidation.issues.map((issue) => issue.message),
      [benchmarkCases.length > 0 ? `${benchmarkCases.length} benchmark cases loaded` : "No benchmark cases found."],
    );

    const topics = buildTopicMetrics(
      {
        blueprint: blueprintCorpus,
        pack: packCorpus,
        lessons: lessonsCorpus,
        patterns: patternCorpus,
        decisionRecords: decisionCorpus,
        benchmarks: benchmarkCorpus,
        all: allCorpus,
      },
      blueprints,
      pack,
      lessons,
      patterns,
      decisionRecords,
      benchmarkCases,
    );

    const metrics = createDomainCoverageMetrics({
      conceptCount: blueprintConcepts.length,
      duplicateConceptCount: 0,
      missingConceptCount: blueprintConcepts.length - packConceptCoverage.present,
      missingPatternCoverage: blueprintConcepts.length - patternsConceptCoverage.present,
      missingDecisionCoverage: blueprintConcepts.length - decisionsConceptCoverage.present,
      missingBenchmarkCoverage: blueprintConcepts.length - benchmarkConceptCoverage.present,
      glossaryCoverage: topics.find((metric) => metric.id === "glossary")?.coveragePercent ?? 0,
      crossSentenceCoverage: topics.find((metric) => metric.id === "cross_sentence")?.coveragePercent ?? 0,
      crossSceneCoverage: topics.find((metric) => metric.id === "cross_scene")?.coveragePercent ?? 0,
      descriptionCoverage: topics.find((metric) => metric.id === "description")?.coveragePercent ?? 0,
      dialogueCoverage: topics.find((metric) => metric.id === "dialogue")?.coveragePercent ?? 0,
      observationCoverage: topics.find((metric) => metric.id === "observation")?.coveragePercent ?? 0,
      contextsCoverage: topics.find((metric) => metric.id === "contexts")?.coveragePercent ?? 0,
      targetsCoverage: topics.find((metric) => metric.id === "targets")?.coveragePercent ?? 0,
      actionsCoverage: topics.find((metric) => metric.id === "actions")?.coveragePercent ?? 0,
      intentsCoverage: topics.find((metric) => metric.id === "intents")?.coveragePercent ?? 0,
      relationshipsCoverage: topics.find((metric) => metric.id === "relationships")?.coveragePercent ?? 0,
      evidenceRulesCoverage: topics.find((metric) => metric.id === "evidence_rules")?.coveragePercent ?? 0,
      exceptionsCoverage: topics.find((metric) => metric.id === "exceptions")?.coveragePercent ?? 0,
      falsePositivesCoverage: topics.find((metric) => metric.id === "false_positives")?.coveragePercent ?? 0,
      falseNegativesCoverage: topics.find((metric) => metric.id === "false_negatives")?.coveragePercent ?? 0,
      reviewerQuestionsCoverage: topics.find((metric) => metric.id === "reviewer_questions")?.coveragePercent ?? 0,
      methodologyCoverage: topics.find((metric) => metric.id === "methodology")?.coveragePercent ?? 0,
      gcamMappingCoverage: topics.find((metric) => metric.id === "gcam_mapping")?.coveragePercent ?? 0,
      topics,
    });

    const productionReadiness = computeDomainProductionReadiness([
      blueprintSection,
      knowledgePackSection,
      lessonsSection,
      patternsSection,
      decisionRecordsSection,
      benchmarksSection,
    ]);

    const domainTitle = renderDomainTitle(domainRoot, blueprints, pack.document?.metadata.title ?? null);
    const coverageGaps = buildCoverageGaps(blueprintSection, knowledgePackSection, lessonsSection, patternsSection, decisionRecordsSection, benchmarksSection, topics);
    const warnings = sortedUnique([
      ...buildWarnings(lessons, decisionRecords, benchmarkCases),
      ...blueprintSection.warnings,
      ...knowledgePackSection.warnings,
      ...lessonsSection.warnings,
      ...patternsSection.warnings,
      ...decisionRecordsSection.warnings,
      ...benchmarksSection.warnings,
    ]);
    const criticalGaps = buildCriticalGaps([blueprintSection, knowledgePackSection, lessonsSection, patternsSection, decisionRecordsSection, benchmarksSection], warnings);
    const recommendation: DomainCoverageReport["recommendation"] = productionReadiness >= 90 && criticalGaps.length === 0 ? "READY" : "NOT READY";

    const domainVersion = blueprints[0]?.version ?? (pack.document ? `${pack.document.metadata.version.major}.${pack.document.metadata.version.minor}.${pack.document.metadata.version.patch}` : "1.0.0");

    const report = Object.freeze({
      domainId: domainRoot,
      domainTitle,
      domainVersion,
      blueprint: blueprintSection,
      knowledgePack: knowledgePackSection,
      lessons: lessonsSection,
      patterns: patternsSection,
      decisionRecords: decisionRecordsSection,
      benchmarks: benchmarksSection,
      metrics,
      productionReadiness,
      recommendation,
      coverageGaps,
      criticalGaps,
      warnings,
    } satisfies Omit<DomainCoverageReport, "hash">);

    return Object.freeze({
      ...report,
      hash: hashValue(report),
    });
  }
}

export function createDomainCoverageAnalyzer(rootDir = DEFAULT_ROOT): DomainCoverageAnalyzer {
  return new DomainCoverageAnalyzer(rootDir);
}

export function analyzeDomainCoverage(domainId: string, rootDir = DEFAULT_ROOT): DomainCoverageReport {
  return createDomainCoverageAnalyzer(rootDir).analyze(domainId);
}

export function discoverDomainCoverageDomains(rootDir = DEFAULT_ROOT): readonly string[] {
  return discoverDomainIds(rootDir);
}
