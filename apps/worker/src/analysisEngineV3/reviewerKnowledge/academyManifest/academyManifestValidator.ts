import { hashValue, isPlainObject, uniqueSorted } from "./academyManifestUtils.js";
import type { AcademyManifest, AcademyManifestValidationIssue, AcademyManifestValidationResult } from "./academyManifestTypes.js";

function pushIssue(issues: AcademyManifestValidationIssue[], severity: AcademyManifestValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function stripManifestHash(manifest: AcademyManifest): Omit<AcademyManifest, "summary"> & { summary: Omit<AcademyManifest["summary"], "manifest_hash"> } {
  return {
    schema_version: manifest.schema_version,
    academy_version: manifest.academy_version,
    academies: manifest.academies,
    lessons: manifest.lessons,
    summary: {
      academy_count: manifest.summary.academy_count,
      lesson_count: manifest.summary.lesson_count,
      missing_lesson_count: manifest.summary.missing_lesson_count,
      missing_lesson_ids: manifest.summary.missing_lesson_ids,
      academy_dependency_count: manifest.summary.academy_dependency_count,
      unlocked_academy_count: manifest.summary.unlocked_academy_count,
      unlocked_academy_ids: manifest.summary.unlocked_academy_ids,
      completion_percent: manifest.summary.completion_percent,
    },
  };
}

export function validateAcademyManifest(manifest: AcademyManifest): AcademyManifestValidationResult {
  const issues: AcademyManifestValidationIssue[] = [];

  if (manifest.schema_version !== 1) {
    pushIssue(issues, "error", "manifest.schema_version", "schema_version", "Manifest schema version must be 1.");
  }

  if (!isPlainObject(manifest.academy_version)) {
    pushIssue(issues, "error", "manifest.academy_version", "academy_version", "Academy version must be a version object.");
  }

  const academyIds = new Set<string>();
  const lessonIds = new Set<string>();
  const academyById = new Map(manifest.academies.map((academy) => [academy.academy_id, academy] as const));
  const academyByKey = new Map(manifest.academies.map((academy) => [academy.academy_key, academy] as const));

  for (const [index, academy] of manifest.academies.entries()) {
    if (academyIds.has(academy.academy_id)) {
      pushIssue(issues, "error", `academy.${index}.academy_id`, `academies[${index}].academy_id`, `Duplicate academy id "${academy.academy_id}".`);
    }
    academyIds.add(academy.academy_id);

    const derivedMissing = uniqueSorted(academy.missing_lesson_ids);
    if (derivedMissing.join("|") !== academy.missing_lesson_ids.join("|")) {
      pushIssue(issues, "error", `academy.${index}.missing_lesson_ids`, `academies[${index}].missing_lesson_ids`, "Missing lesson ids must be stable and sorted.");
    }

    if (academy.completion_percent < 0 || academy.completion_percent > 100) {
      pushIssue(issues, "error", `academy.${index}.completion_percent`, `academies[${index}].completion_percent`, "Academy completion must be between 0 and 100.");
    }

    if (academy.lesson_count !== academy.lesson_ids.length) {
      pushIssue(issues, "error", `academy.${index}.lesson_count`, `academies[${index}].lesson_count`, "Lesson count must match the lesson id list.");
    }

    if (academy.missing_lesson_count !== academy.missing_lesson_ids.length) {
      pushIssue(issues, "error", `academy.${index}.missing_lesson_count`, `academies[${index}].missing_lesson_count`, "Missing lesson count must match the missing lesson id list.");
    }

    if (academy.unlocked && academy.lesson_count === 0) {
      pushIssue(issues, "warning", `academy.${index}.unlocked`, `academies[${index}].unlocked`, "Unlocked academies should contain lessons.");
    }

    const recomputedHash = hashValue({
      academy_id: academy.academy_id,
      academy_key: academy.academy_key,
      version: academy.version,
      title: academy.title,
      description: academy.description,
      supported_concepts: academy.supported_concepts,
      folder: academy.folder,
      file: academy.file,
      has_pack: academy.has_pack,
      lesson_ids: academy.lesson_ids,
      lesson_count: academy.lesson_count,
      missing_lesson_ids: academy.missing_lesson_ids,
      missing_lesson_count: academy.missing_lesson_count,
      academy_dependencies: academy.academy_dependencies,
      unlocked: academy.unlocked,
      completion_percent: academy.completion_percent,
    });

    if (recomputedHash !== academy.hash) {
      pushIssue(issues, "error", `academy.${index}.hash`, `academies[${index}].hash`, "Academy hash does not match its canonical representation.");
    }
  }

  for (const [index, lesson] of manifest.lessons.entries()) {
    if (lessonIds.has(lesson.lesson_id)) {
      pushIssue(issues, "error", `lesson.${index}.lesson_id`, `lessons[${index}].lesson_id`, `Duplicate lesson id "${lesson.lesson_id}".`);
    }
    lessonIds.add(lesson.lesson_id);

    if (!academyById.has(lesson.academy_id) && !academyByKey.has(lesson.academy_key)) {
      pushIssue(issues, "error", `lesson.${index}.academy_id`, `lessons[${index}].academy_id`, `Lesson academy "${lesson.academy_id}" is not registered.`);
    }

    if (!Number.isFinite(lesson.lesson_number ?? Number.NaN) && lesson.lesson_number !== null) {
      pushIssue(issues, "error", `lesson.${index}.lesson_number`, `lessons[${index}].lesson_number`, "Lesson number must be numeric when present.");
    }

    if (lesson.lesson_number !== null && lesson.lesson_number <= 0) {
      pushIssue(issues, "error", `lesson.${index}.lesson_number`, `lessons[${index}].lesson_number`, "Lesson number must be positive when present.");
    }

    if (lesson.lesson_id.trim().length === 0 || lesson.title.trim().length === 0 || lesson.summary.trim().length === 0) {
      pushIssue(issues, "error", `lesson.${index}`, `lessons[${index}]`, "Lesson identity fields must not be empty.");
    }

    const recomputedHash = hashValue({
      lesson_id: lesson.lesson_id,
      lesson_version: lesson.lesson_version,
      lesson_number: lesson.lesson_number,
      title: lesson.title,
      summary: lesson.summary,
      category: lesson.category,
      academy_key: lesson.academy_key,
      academy_id: lesson.academy_id,
      depends_on: lesson.depends_on,
      source_file: lesson.source_file,
    });

    if (recomputedHash !== lesson.hash) {
      pushIssue(issues, "error", `lesson.${index}.hash`, `lessons[${index}].hash`, "Lesson hash does not match its canonical representation.");
    }
  }

  const lessonIdSet = new Set(manifest.lessons.map((lesson) => lesson.lesson_id));
  for (const [index, lesson] of manifest.lessons.entries()) {
    for (const dependencyId of lesson.depends_on) {
      if (!lessonIdSet.has(dependencyId)) {
        pushIssue(issues, "error", `lesson.${index}.depends_on`, `lessons[${index}].depends_on`, `Missing lesson dependency "${dependencyId}".`);
      }
    }
  }

  const academyDependencyGraph = new Map<string, Set<string>>();
  for (const academy of manifest.academies) {
    academyDependencyGraph.set(academy.academy_id, new Set<string>());
  }
  for (const lesson of manifest.lessons) {
    const bucket = academyDependencyGraph.get(lesson.academy_id);
    if (!bucket) continue;
    for (const dependencyId of lesson.depends_on) {
      const dependencyLesson = manifest.lessons.find((candidate) => candidate.lesson_id === dependencyId);
      if (dependencyLesson && dependencyLesson.academy_id !== lesson.academy_id) {
        bucket.add(dependencyLesson.academy_id);
      }
    }
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const cycles: string[][] = [];

  function visit(node: string, trail: string[]): void {
    if (active.has(node)) {
      const start = trail.indexOf(node);
      cycles.push(start >= 0 ? trail.slice(start).concat(node) : [...trail, node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    for (const next of academyDependencyGraph.get(node) ?? []) {
      visit(next, [...trail, node]);
    }
    active.delete(node);
  }

  for (const academy of manifest.academies) {
    visit(academy.academy_id, []);
  }

  for (const cycle of cycles) {
    pushIssue(issues, "error", "academy.cycle", "academies", `Academy dependency cycle detected: ${cycle.join(" -> ")}.`);
  }

  const computedMissingLessonIds = uniqueSorted(manifest.academies.flatMap((academy) => academy.missing_lesson_ids));
  if (computedMissingLessonIds.join("|") !== manifest.summary.missing_lesson_ids.join("|")) {
    pushIssue(issues, "error", "summary.missing_lesson_ids", "summary.missing_lesson_ids", "Summary missing lesson ids must match academy missing lesson ids.");
  }

  const computedUnlockedAcademyIds = uniqueSorted(manifest.academies.filter((academy) => academy.unlocked).map((academy) => academy.academy_id));
  if (computedUnlockedAcademyIds.join("|") !== manifest.summary.unlocked_academy_ids.join("|")) {
    pushIssue(issues, "error", "summary.unlocked_academy_ids", "summary.unlocked_academy_ids", "Summary unlocked academy ids must match academy flags.");
  }

  const computedManifestHash = hashValue(stripManifestHash(manifest));
  if (computedManifestHash !== manifest.summary.manifest_hash) {
    pushIssue(issues, "error", "summary.manifest_hash", "summary.manifest_hash", "Manifest hash does not match its canonical representation.");
  }

  const valid = !issues.some((issue) => issue.severity === "error");
  return Object.freeze({
    valid,
    issues: Object.freeze(issues.sort((left, right) =>
      left.severity.localeCompare(right.severity) ||
      compareStrings(left.path, right.path) ||
      compareStrings(left.code, right.code) ||
      compareStrings(left.message, right.message),
    )),
  });
}
