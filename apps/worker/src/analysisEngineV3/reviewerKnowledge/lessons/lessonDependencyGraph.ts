import type { LessonDependencyEdge, LessonDependencyGraph, LessonDependencyIssue, LessonDependencyNode, ReviewerKnowledgeLesson } from "./lessonTypes.js";

function normalizeId(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map((value) => normalizeId(value)).filter(Boolean).sort((left, right) => left.localeCompare(right)));
}

function normalizeSequence(values: readonly string[]): readonly string[] {
  return Object.freeze(values.map((value) => normalizeId(value)).filter(Boolean));
}

function issue(code: string, path: string, message: string): LessonDependencyIssue {
  return Object.freeze({ code, path, message });
}

function detectCycles(lessonIds: readonly string[], adjacency: Map<string, readonly string[]>): ReadonlyArray<ReadonlyArray<string>> {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];
  const cycles: string[][] = [];

  function dfs(nodeId: string): void {
    if (visiting.has(nodeId)) {
      const start = stack.indexOf(nodeId);
      if (start >= 0) {
        cycles.push([...stack.slice(start), nodeId]);
      }
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    visited.add(nodeId);
    stack.push(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      dfs(next);
    }
    stack.pop();
    visiting.delete(nodeId);
  }

  for (const lessonId of lessonIds) {
    dfs(lessonId);
  }

  const unique = new Map<string, ReadonlyArray<string>>();
  for (const cycle of cycles) {
    const key = cycle.join("->");
    if (!unique.has(key)) unique.set(key, Object.freeze(cycle));
  }
  return Object.freeze([...unique.values()]);
}

export function buildLessonDependencyGraph(lessons: readonly ReviewerKnowledgeLesson[]): LessonDependencyGraph {
  const normalizedLessons = [...lessons].sort((left, right) =>
    normalizeId(left.id).localeCompare(normalizeId(right.id)) ||
    left.version.major - right.version.major ||
    left.version.minor - right.version.minor ||
    left.version.patch - right.version.patch ||
    left.title.localeCompare(right.title),
  );
  const lessonIds = normalizedLessons.map((lesson) => normalizeId(lesson.id));
  const lessonIdSet = new Set(lessonIds);
  const edges: LessonDependencyEdge[] = [];
  const nodes: LessonDependencyNode[] = [];
  const missingReferences: LessonDependencyIssue[] = [];
  const duplicateDependencies: LessonDependencyIssue[] = [];
  const orphanLessons: string[] = [];
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const connected = new Set<string>();

  for (const lesson of normalizedLessons) {
    const id = normalizeId(lesson.id);
    const rawDependencies = normalizeSequence(lesson.prerequisites);
    const rawRelatedLessons = normalizeSequence(lesson.relatedLessons);
    const dependencies = normalizeList(lesson.prerequisites);
    const relatedLessons = normalizeList(lesson.relatedLessons);
    nodes.push(Object.freeze({ id, version: lesson.version, dependencies, relatedLessons }));

    const seenDependencies = new Set<string>();
    for (const dependency of rawDependencies) {
      if (!lessonIdSet.has(dependency)) {
        missingReferences.push(issue("dependency.missing", `prerequisites.${id}`, `Missing referenced lesson: ${dependency}`));
        continue;
      }
      if (seenDependencies.has(dependency)) {
        duplicateDependencies.push(issue("dependency.duplicate", `prerequisites.${id}`, `Duplicate dependency: ${dependency}`));
        continue;
      }
      seenDependencies.add(dependency);
      edges.push(Object.freeze({ from: id, to: dependency, relation: "prerequisite" as const }));
      const current = outgoing.get(id) ?? [];
      if (!current.includes(dependency)) outgoing.set(id, [...current, dependency].sort((left, right) => left.localeCompare(right)));
      incoming.set(dependency, (incoming.get(dependency) ?? 0) + 1);
      connected.add(id);
      connected.add(dependency);
    }

    const seenRelated = new Set<string>();
    for (const related of rawRelatedLessons) {
      if (!lessonIdSet.has(related)) {
        missingReferences.push(issue("related.missing", `relatedLessons.${id}`, `Missing referenced lesson: ${related}`));
        continue;
      }
      if (seenRelated.has(related)) {
        duplicateDependencies.push(issue("related.duplicate", `relatedLessons.${id}`, `Duplicate related lesson: ${related}`));
        continue;
      }
      seenRelated.add(related);
      edges.push(Object.freeze({ from: id, to: related, relation: "related" as const }));
      connected.add(id);
      connected.add(related);
    }
  }

  for (const lessonId of lessonIds) {
    if (!connected.has(lessonId) && lessonIds.length > 1) {
      orphanLessons.push(lessonId);
    }
  }

  const cycles = detectCycles(lessonIds, new Map([...outgoing.entries()].map(([key, values]) => [key, Object.freeze(values)])));

  return Object.freeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    cycles,
    missingReferences: Object.freeze(missingReferences),
    duplicateDependencies: Object.freeze(duplicateDependencies),
    orphanLessons: Object.freeze(orphanLessons.sort((left, right) => left.localeCompare(right))),
  });
}
