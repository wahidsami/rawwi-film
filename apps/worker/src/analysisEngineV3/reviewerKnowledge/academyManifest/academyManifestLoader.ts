import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseReviewerKnowledgeDocumentText } from "../reviewerKnowledgeIO.js";
import { parseReviewerKnowledgeLessonInput } from "../lessons/lessonSchema.js";
import { parseReviewerAcademyPackDocumentText } from "../academy/reviewerAcademyIndex.js";
import type { ReviewerAcademyPackDocument } from "../academy/reviewerAcademyTypes.js";
import type { AcademyManifest, AcademyManifestAcademy, AcademyManifestLesson } from "./academyManifestTypes.js";
import {
  academyKeyFromId,
  asStringList,
  hashValue,
  isPlainObject,
  lessonNumberFromText,
  normalizeId,
  normalizeRelativePath,
  normalizeText,
  normalizeVersion,
  padLessonNumber,
  uniqueSorted,
} from "./academyManifestUtils.js";

const PACK_FILE_NAMES = Object.freeze(["pack.v1.json", "pack.v1.yaml", "pack.v1.yml"]);
const LESSON_FILE_PATTERN = /^lesson_.*\.v\d+\.(?:json|ya?ml)$/i;

type AcademyLessonSource = Readonly<{
  lesson: AcademyManifestLesson;
}>;

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function discoverPackFiles(academyRoot: string): readonly string[] {
  if (!isDirectory(academyRoot)) {
    return [];
  }

  const folders = readdirSync(academyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const files: string[] = [];
  for (const folder of folders) {
    for (const fileName of PACK_FILE_NAMES) {
      const filePath = join(academyRoot, folder, fileName);
      if (existsSync(filePath)) {
        files.push(filePath);
        break;
      }
    }
  }

  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function discoverLessonFiles(lessonsRoot: string): readonly string[] {
  if (!isDirectory(lessonsRoot)) {
    return [];
  }

  const files: string[] = [];
  const stack: string[] = [lessonsRoot];

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

      if (LESSON_FILE_PATTERN.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function readAcademyDocuments(academyRoot: string): readonly ReviewerAcademyPackDocument[] {
  if (!isDirectory(academyRoot)) {
    return [];
  }

  const documents: ReviewerAcademyPackDocument[] = [];
  for (const filePath of discoverPackFiles(academyRoot)) {
    documents.push(parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8")));
  }

  return Object.freeze(documents);
}

function toLessonNumber(rawLessonNumber: unknown, lessonId: string, filePath: string): number | null {
  if (typeof rawLessonNumber === "number" && Number.isFinite(rawLessonNumber) && rawLessonNumber > 0) {
    return Math.trunc(rawLessonNumber);
  }

  const byId = lessonNumberFromText(lessonId);
  if (byId !== null) {
    return byId;
  }

  return lessonNumberFromText(filePath);
}

function readLessonSources(lessonsRoot: string): readonly AcademyLessonSource[] {
  if (!isDirectory(lessonsRoot)) {
    return [];
  }

  const lessons: AcademyLessonSource[] = [];
  for (const filePath of discoverLessonFiles(lessonsRoot)) {
    const raw = parseReviewerKnowledgeDocumentText(readFileSync(filePath, "utf8"));
    parseReviewerKnowledgeLessonInput(raw);

    if (!isPlainObject(raw)) {
      continue;
    }

    const lessonId = typeof raw.id === "string" ? normalizeId(raw.id) : normalizeId(filePath);
    const category = typeof raw.category === "string" ? normalizeId(raw.category) : "unknown";
    const version = normalizeVersion(raw.version);
    const title = typeof raw.title === "string" ? normalizeText(raw.title) : lessonId;
    const summary = typeof raw.summary === "string" ? normalizeText(raw.summary) : "";
    const dependsOn = uniqueSorted(asStringList(raw.dependsOn));
    const sourceFile = normalizeRelativePath(relative(lessonsRoot, filePath));

    lessons.push(Object.freeze({
      lesson: Object.freeze({
        lesson_id: lessonId,
        lesson_version: version,
        lesson_number: toLessonNumber(raw.lessonNumber, lessonId, filePath),
        title,
        summary,
        category,
        academy_key: academyKeyFromId(category),
        academy_id: "",
        depends_on: dependsOn,
        source_file: sourceFile,
        hash: "",
      }),
    }));
  }

  return Object.freeze(lessons.sort((left, right) =>
    (left.lesson.lesson_number ?? Number.POSITIVE_INFINITY) - (right.lesson.lesson_number ?? Number.POSITIVE_INFINITY) ||
    left.lesson.lesson_id.localeCompare(right.lesson.lesson_id) ||
    left.lesson.lesson_version.major - right.lesson.lesson_version.major ||
    left.lesson.lesson_version.minor - right.lesson.lesson_version.minor ||
    left.lesson.lesson_version.patch - right.lesson.lesson_version.patch ||
    left.lesson.source_file.localeCompare(right.lesson.source_file),
  ));
}

function buildLessonEntries(academyDocuments: readonly ReviewerAcademyPackDocument[], lessonSources: readonly AcademyLessonSource[]): readonly AcademyManifestLesson[] {
  const academyIdByKey = new Map<string, string>();
  for (const document of academyDocuments) {
    academyIdByKey.set(academyKeyFromId(document.metadata.id), document.metadata.id);
  }

  const lessonEntries = lessonSources.map((source) => {
    const academyId = academyIdByKey.get(source.lesson.academy_key) ?? source.lesson.academy_key;
    return Object.freeze({
      ...source.lesson,
      academy_id: academyId,
      hash: hashValue({
        lesson_id: source.lesson.lesson_id,
        lesson_version: source.lesson.lesson_version,
        lesson_number: source.lesson.lesson_number,
        title: source.lesson.title,
        summary: source.lesson.summary,
        category: source.lesson.category,
        academy_key: source.lesson.academy_key,
        academy_id: academyId,
        depends_on: source.lesson.depends_on,
        source_file: source.lesson.source_file,
      }),
    });
  });

  return Object.freeze(lessonEntries.sort((left, right) =>
    (left.lesson_number ?? Number.POSITIVE_INFINITY) - (right.lesson_number ?? Number.POSITIVE_INFINITY) ||
    left.lesson_id.localeCompare(right.lesson_id) ||
    left.lesson_version.major - right.lesson_version.major ||
    left.lesson_version.minor - right.lesson_version.minor ||
    left.lesson_version.patch - right.lesson_version.patch ||
    left.source_file.localeCompare(right.source_file),
  ));
}

function computeMissingLessonIds(lessonEntries: readonly AcademyManifestLesson[]): readonly string[] {
  const lessonNumbers = lessonEntries
    .map((lesson) => lesson.lesson_number)
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0);

  const missing = new Set<string>();
  if (lessonNumbers.length > 0) {
    const observed = new Set(lessonNumbers);
    const maxLessonNumber = Math.max(...lessonNumbers);
    for (let number = 1; number <= maxLessonNumber; number += 1) {
      if (!observed.has(number)) {
        missing.add(`lesson_${padLessonNumber(number)}`);
      }
    }
  }

  return Object.freeze([...missing].sort((left, right) => left.localeCompare(right)));
}

function buildAcademyEntries(
  academyDocuments: readonly ReviewerAcademyPackDocument[],
  lessons: readonly AcademyManifestLesson[],
): readonly AcademyManifestAcademy[] {
  const academyByKey = new Map<string, ReviewerAcademyPackDocument>();
  const academyIdByKey = new Map<string, string>();
  for (const document of academyDocuments) {
    const academyKey = academyKeyFromId(document.metadata.id);
    academyByKey.set(academyKey, document);
    academyIdByKey.set(academyKey, document.metadata.id);
  }

  const lessonsByAcademyKey = new Map<string, AcademyManifestLesson[]>();
  for (const lesson of lessons) {
    const key = lesson.academy_key;
    const bucket = lessonsByAcademyKey.get(key) ?? [];
    bucket.push(lesson);
    lessonsByAcademyKey.set(key, bucket);
  }

  const academyDependencyKeys = new Map<string, Set<string>>();
  const missingLessonIdsByAcademy = new Map<string, Set<string>>();

  for (const academyKey of academyByKey.keys()) {
    academyDependencyKeys.set(academyKey, new Set<string>());
    missingLessonIdsByAcademy.set(academyKey, new Set<string>());
  }

  for (const lesson of lessons) {
    const academyKey = lesson.academy_key;
    const missingLessonSet = missingLessonIdsByAcademy.get(academyKey) ?? new Set<string>();
    const dependencySet = academyDependencyKeys.get(academyKey) ?? new Set<string>();

    for (const dependencyId of lesson.depends_on) {
      const dependencyLesson = lessons.find((candidate) => candidate.lesson_id === dependencyId);
      if (!dependencyLesson) {
        missingLessonSet.add(dependencyId);
        continue;
      }

      if (dependencyLesson.academy_key !== academyKey) {
        dependencySet.add(dependencyLesson.academy_id);
      }
    }

    academyDependencyKeys.set(academyKey, dependencySet);
    missingLessonIdsByAcademy.set(academyKey, missingLessonSet);
  }

  const entries: AcademyManifestAcademy[] = [];
  for (const document of academyDocuments) {
    const academyKey = academyKeyFromId(document.metadata.id);
    const academyId = document.metadata.id;
    const matchingLessons = lessonsByAcademyKey.get(academyKey) ?? [];
    const lessonIds = Object.freeze(
      [...matchingLessons]
        .sort((left, right) =>
          (left.lesson_number ?? Number.POSITIVE_INFINITY) - (right.lesson_number ?? Number.POSITIVE_INFINITY) ||
          left.lesson_id.localeCompare(right.lesson_id) ||
          left.lesson_version.major - right.lesson_version.major ||
          left.lesson_version.minor - right.lesson_version.minor ||
          left.lesson_version.patch - right.lesson_version.patch,
        )
        .map((lesson) => lesson.lesson_id),
    );

    const missingLessonIds = new Set<string>(missingLessonIdsByAcademy.get(academyKey) ?? []);
    for (const missingId of computeMissingLessonIds(matchingLessons)) {
      missingLessonIds.add(missingId);
    }

    const missingLessonList = Object.freeze([...missingLessonIds].sort((left, right) => left.localeCompare(right)));
    const academyDependencies = Object.freeze([...(academyDependencyKeys.get(academyKey) ?? new Set<string>())].sort((left, right) => left.localeCompare(right)));
    const lessonCount = lessonIds.length;
    const missingLessonCount = missingLessonList.length;
    const completionPercent = lessonCount + missingLessonCount > 0
      ? Number(((lessonCount / (lessonCount + missingLessonCount)) * 100).toFixed(3))
      : 0;
    const unlocked = lessonCount > 0 && missingLessonCount === 0 && academyDependencies.every((dependency) => academyByKey.has(academyKeyFromId(dependency)));

    entries.push(Object.freeze({
      academy_id: academyId,
      academy_key: academyKey,
      version: document.metadata.version,
      title: document.metadata.title,
      description: document.metadata.description,
      supported_concepts: document.metadata.supported_concepts,
      folder: academyKey,
      file: "pack.v1.json",
      has_pack: document.pack !== null,
      lesson_ids: lessonIds,
      lesson_count: lessonCount,
      missing_lesson_ids: missingLessonList,
      missing_lesson_count: missingLessonCount,
      academy_dependencies: academyDependencies,
      unlocked,
      completion_percent: completionPercent,
      hash: hashValue({
        academy_id: academyId,
        academy_key: academyKey,
        version: document.metadata.version,
        title: document.metadata.title,
        description: document.metadata.description,
        supported_concepts: document.metadata.supported_concepts,
        folder: academyKey,
        file: "pack.v1.json",
        has_pack: document.pack !== null,
        lesson_ids: lessonIds,
        lesson_count: lessonCount,
        missing_lesson_ids: missingLessonList,
        missing_lesson_count: missingLessonCount,
        academy_dependencies: academyDependencies,
        unlocked,
        completion_percent: completionPercent,
      }),
    }));
  }

  return Object.freeze(entries.sort((left, right) =>
    left.academy_id.localeCompare(right.academy_id) ||
    left.version.major - right.version.major ||
    left.version.minor - right.version.minor ||
    left.version.patch - right.version.patch,
  ));
}

function buildSummary(academies: readonly AcademyManifestAcademy[], lessons: readonly AcademyManifestLesson[]): AcademyManifest["summary"] {
  const missingLessonIds = uniqueSorted(academies.flatMap((academy) => academy.missing_lesson_ids));
  const unlockedAcademyIds = uniqueSorted(academies.filter((academy) => academy.unlocked).map((academy) => academy.academy_id));
  const academyDependencyCount = academies.reduce((sum, academy) => sum + academy.academy_dependencies.length, 0);
  const weightedExpected = academies.reduce((sum, academy) => sum + academy.lesson_count + academy.missing_lesson_count, 0);
  const weightedCompleted = academies.reduce((sum, academy) => sum + academy.lesson_count, 0);
  const completionPercent = weightedExpected > 0 ? Number(((weightedCompleted / weightedExpected) * 100).toFixed(3)) : 0;

  return Object.freeze({
    academy_count: academies.length,
    lesson_count: lessons.length,
    missing_lesson_count: missingLessonIds.length,
    missing_lesson_ids: missingLessonIds,
    academy_dependency_count: academyDependencyCount,
    unlocked_academy_count: unlockedAcademyIds.length,
    unlocked_academy_ids: unlockedAcademyIds,
    completion_percent: completionPercent,
    manifest_hash: "",
  });
}

function hashManifest(manifest: Omit<AcademyManifest, "summary"> & { summary: Omit<AcademyManifest["summary"], "manifest_hash"> }): string {
  return hashValue(manifest);
}

export function loadAcademyManifest(rootDir = join(dirname(fileURLToPath(import.meta.url)), "..")): AcademyManifest {
  const academyRoot = join(rootDir, "academy");
  const lessonsRoot = join(rootDir, "lessons");
  const academyDocuments = readAcademyDocuments(academyRoot);
  const lessonEntries = buildLessonEntries(academyDocuments, readLessonSources(lessonsRoot));
  const academies = buildAcademyEntries(academyDocuments, lessonEntries);
  const summaryWithoutHash = buildSummary(academies, lessonEntries);

  const manifestWithoutHash = Object.freeze({
    schema_version: 1 as const,
    academy_version: academyDocuments.reduce<AcademyManifest["academy_version"]>((highest, document) => {
      const version = document.metadata.version;
      if (version.major > highest.major) return version;
      if (version.major < highest.major) return highest;
      if (version.minor > highest.minor) return version;
      if (version.minor < highest.minor) return highest;
      if (version.patch > highest.patch) return version;
      return highest;
    }, academyDocuments[0]?.metadata.version ?? { major: 1, minor: 0, patch: 0 }),
    academies,
    lessons: lessonEntries,
    summary: Object.freeze({
      academy_count: summaryWithoutHash.academy_count,
      lesson_count: summaryWithoutHash.lesson_count,
      missing_lesson_count: summaryWithoutHash.missing_lesson_count,
      missing_lesson_ids: summaryWithoutHash.missing_lesson_ids,
      academy_dependency_count: summaryWithoutHash.academy_dependency_count,
      unlocked_academy_count: summaryWithoutHash.unlocked_academy_count,
      unlocked_academy_ids: summaryWithoutHash.unlocked_academy_ids,
      completion_percent: summaryWithoutHash.completion_percent,
      manifest_hash: "",
    }),
  });

  const manifestHash = hashManifest({
    schema_version: manifestWithoutHash.schema_version,
    academy_version: manifestWithoutHash.academy_version,
    academies: manifestWithoutHash.academies,
    lessons: manifestWithoutHash.lessons,
    summary: {
      academy_count: manifestWithoutHash.summary.academy_count,
      lesson_count: manifestWithoutHash.summary.lesson_count,
      missing_lesson_count: manifestWithoutHash.summary.missing_lesson_count,
      missing_lesson_ids: manifestWithoutHash.summary.missing_lesson_ids,
      academy_dependency_count: manifestWithoutHash.summary.academy_dependency_count,
      unlocked_academy_count: manifestWithoutHash.summary.unlocked_academy_count,
      unlocked_academy_ids: manifestWithoutHash.summary.unlocked_academy_ids,
      completion_percent: manifestWithoutHash.summary.completion_percent,
    },
  });

  return Object.freeze({
    schema_version: 1,
    academy_version: manifestWithoutHash.academy_version,
    academies: manifestWithoutHash.academies,
    lessons: manifestWithoutHash.lessons,
    summary: Object.freeze({
      ...manifestWithoutHash.summary,
      manifest_hash: manifestHash,
    }),
  });
}
