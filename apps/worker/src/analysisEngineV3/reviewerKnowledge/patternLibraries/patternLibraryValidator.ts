import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type {
  PatternLibraryDocument,
  PatternLibraryEntry,
  PatternLibraryValidationIssue,
  PatternLibraryValidationResult,
} from "./patternLibraryTypes.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function pushIssue(issues: PatternLibraryValidationIssue[], severity: PatternLibraryValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function semverValid(version: unknown): version is { major: number; minor: number; patch: number } {
  return isPlainObject(version)
    && typeof version.major === "number"
    && typeof version.minor === "number"
    && typeof version.patch === "number"
    && Number.isInteger(version.major)
    && Number.isInteger(version.minor)
    && Number.isInteger(version.patch)
    && version.major >= 0
    && version.minor >= 0
    && version.patch >= 0;
}

function normalizeList(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function readDocument(filePath: string): PatternLibraryDocument {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid pattern library document: ${filePath}`);
  }

  const metadata = isPlainObject(parsed.metadata) ? parsed.metadata : {};
  const concepts = Array.isArray(metadata.concepts) ? metadata.concepts : [];
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return Object.freeze({
    schema_version: 1,
    version: semverValid(parsed.version) ? Object.freeze({ major: parsed.version.major, minor: parsed.version.minor, patch: parsed.version.patch }) : Object.freeze({ major: 0, minor: 0, patch: 0 }),
    metadata: Object.freeze({
      id: typeof metadata.id === "string" ? normalizeText(metadata.id) : "",
      title: typeof metadata.title === "string" ? normalizeText(metadata.title) : "",
      description: typeof metadata.description === "string" ? normalizeText(metadata.description) : "",
      concepts: Object.freeze(concepts.filter(isPlainObject).map((concept) => Object.freeze({
        id: typeof concept.id === "string" ? normalizeText(concept.id) : "",
        title: typeof concept.title === "string" ? normalizeText(concept.title) : "",
        description: typeof concept.description === "string" ? normalizeText(concept.description) : "",
      }))),
    }),
    entries: Object.freeze(entries.filter(isPlainObject).map((entry) => Object.freeze({
      id: typeof entry.id === "string" ? normalizeText(entry.id) : "",
      title: typeof entry.title === "string" ? normalizeText(entry.title) : "",
      description: typeof entry.description === "string" ? normalizeText(entry.description) : "",
      primary_concept_id: typeof entry.primary_concept_id === "string" ? normalizeText(entry.primary_concept_id) : "",
      related_concept_ids: normalizeList(Array.isArray(entry.related_concept_ids) ? entry.related_concept_ids.filter((value): value is string => typeof value === "string") : []),
      direct_expressions: normalizeList(Array.isArray(entry.direct_expressions) ? entry.direct_expressions.filter((value): value is string => typeof value === "string") : []),
      indirect_expressions: normalizeList(Array.isArray(entry.indirect_expressions) ? entry.indirect_expressions.filter((value): value is string => typeof value === "string") : []),
      semantic_intent: normalizeList(Array.isArray(entry.semantic_intent) ? entry.semantic_intent.filter((value): value is string => typeof value === "string") : []),
      supporting_evidence: normalizeList(Array.isArray(entry.supporting_evidence) ? entry.supporting_evidence.filter((value): value is string => typeof value === "string") : []),
      contradictory_evidence: normalizeList(Array.isArray(entry.contradictory_evidence) ? entry.contradictory_evidence.filter((value): value is string => typeof value === "string") : []),
      false_positives: normalizeList(Array.isArray(entry.false_positives) ? entry.false_positives.filter((value): value is string => typeof value === "string") : []),
      counter_examples: normalizeList(Array.isArray(entry.counter_examples) ? entry.counter_examples.filter((value): value is string => typeof value === "string") : []),
      cross_sentence_indicators: normalizeList(Array.isArray(entry.cross_sentence_indicators) ? entry.cross_sentence_indicators.filter((value): value is string => typeof value === "string") : []),
      scene_indicators: normalizeList(Array.isArray(entry.scene_indicators) ? entry.scene_indicators.filter((value): value is string => typeof value === "string") : []),
      reviewer_guidance: normalizeList(Array.isArray(entry.reviewer_guidance) ? entry.reviewer_guidance.filter((value): value is string => typeof value === "string") : []),
      confidence_modifiers: Object.freeze((Array.isArray(entry.confidence_modifiers) ? entry.confidence_modifiers : []).filter(isPlainObject).map((modifier) => Object.freeze({
        id: typeof modifier.id === "string" ? normalizeText(modifier.id) : "",
        title: typeof modifier.title === "string" ? normalizeText(modifier.title) : "",
        description: typeof modifier.description === "string" ? normalizeText(modifier.description) : "",
        confidence: typeof modifier.confidence === "number" && Number.isFinite(modifier.confidence) ? modifier.confidence : -1,
      }))),
      glossary_relationships: Object.freeze((Array.isArray(entry.glossary_relationships) ? entry.glossary_relationships : []).filter(isPlainObject).map((relationship) => Object.freeze({
        id: typeof relationship.id === "string" ? normalizeText(relationship.id) : "",
        from_concept_id: typeof relationship.from_concept_id === "string" ? normalizeText(relationship.from_concept_id) : "",
        to_concept_id: typeof relationship.to_concept_id === "string" ? normalizeText(relationship.to_concept_id) : "",
        relation: typeof relationship.relation === "string" ? normalizeText(relationship.relation) as PatternLibraryDocument["entries"][number]["glossary_relationships"][number]["relation"] : "related",
        note: typeof relationship.note === "string" ? normalizeText(relationship.note) : null,
      }))),
      gcam_mappings: Object.freeze((Array.isArray(entry.gcam_mappings) ? entry.gcam_mappings : []).filter(isPlainObject).map((mapping) => Object.freeze({
        id: typeof mapping.id === "string" ? normalizeText(mapping.id) : "",
        article_id: typeof mapping.article_id === "number" && Number.isFinite(mapping.article_id) ? mapping.article_id : 0,
        atom_ids: normalizeList(Array.isArray(mapping.atom_ids) ? mapping.atom_ids.filter((value): value is string => typeof value === "string") : []),
        role: typeof mapping.role === "string" ? normalizeText(mapping.role) : "",
        note: typeof mapping.note === "string" ? normalizeText(mapping.note) : null,
      }))),
      examples: Object.freeze((Array.isArray(entry.examples) ? entry.examples : []).filter(isPlainObject).map((example) => Object.freeze({
        id: typeof example.id === "string" ? normalizeText(example.id) : "",
        title: typeof example.title === "string" ? normalizeText(example.title) : "",
        text: typeof example.text === "string" ? normalizeText(example.text) : "",
        expected_outcome: typeof example.expected_outcome === "string" ? normalizeText(example.expected_outcome) : "",
        note: typeof example.note === "string" ? normalizeText(example.note) : null,
      }))),
    }))),
  });
}

function validateDocument(document: PatternLibraryDocument): PatternLibraryValidationIssue[] {
  const issues: PatternLibraryValidationIssue[] = [];
  if (document.schema_version !== 1) {
    pushIssue(issues, "error", "document.schema_version", "schema_version", "Schema version must be 1.");
  }
  if (!semverValid(document.version)) {
    pushIssue(issues, "error", "document.version", "version", "Document version must be a valid semantic version.");
  }
  if (document.metadata.id.length === 0 || document.metadata.title.length === 0 || document.metadata.description.length === 0) {
    pushIssue(issues, "error", "metadata.required", "metadata", "Metadata id, title, and description are required.");
  }

  const conceptIds = new Set<string>();
  for (const [index, concept] of document.metadata.concepts.entries()) {
    if (concept.id.length === 0 || concept.title.length === 0 || concept.description.length === 0) {
      pushIssue(issues, "error", `metadata.concepts.${index}`, `metadata.concepts[${index}]`, "Concept fields are required.");
    }
    if (conceptIds.has(concept.id)) {
      pushIssue(issues, "error", `metadata.concepts.${index}.id`, `metadata.concepts[${index}].id`, `Duplicate concept id "${concept.id}".`);
    }
    conceptIds.add(concept.id);
  }

  const patternIds = new Set<string>();
  const relationshipEdges: Array<readonly [string, string]> = [];
  for (const [index, pattern] of document.entries.entries()) {
    if (pattern.id.length === 0 || pattern.title.length === 0 || pattern.description.length === 0) {
      pushIssue(issues, "error", `entries.${index}.required`, `entries[${index}]`, "Pattern id, title, and description are required.");
    }
    if (patternIds.has(pattern.id)) {
      pushIssue(issues, "error", `entries.${index}.id`, `entries[${index}].id`, `Duplicate pattern id "${pattern.id}".`);
    }
    patternIds.add(pattern.id);

    if (!conceptIds.has(pattern.primary_concept_id)) {
      pushIssue(issues, "error", `entries.${index}.primary_concept_id`, `entries[${index}].primary_concept_id`, `Missing concept reference "${pattern.primary_concept_id}".`);
    }
    for (const [relatedIndex, conceptId] of pattern.related_concept_ids.entries()) {
      if (!conceptIds.has(conceptId)) {
        pushIssue(issues, "error", `entries.${index}.related_concept_ids.${relatedIndex}`, `entries[${index}].related_concept_ids[${relatedIndex}]`, `Missing concept reference "${conceptId}".`);
      }
    }

    const expressionSet = new Set<string>();
    for (const [bucketName, expressions] of [["direct_expressions", pattern.direct_expressions], ["indirect_expressions", pattern.indirect_expressions]] as const) {
      for (const [expressionIndex, expression] of expressions.entries()) {
        const normalized = normalizeText(expression);
        const expressionKey = `${bucketName}:${normalized}`;
        if (expressionSet.has(normalized)) {
          pushIssue(issues, "error", `entries.${index}.${bucketName}.${expressionIndex}`, `entries[${index}].${bucketName}[${expressionIndex}]`, `Duplicate expression "${normalized}".`);
        }
        expressionSet.add(normalized);
        if (normalized.length === 0) {
          pushIssue(issues, "error", `entries.${index}.${bucketName}.${expressionIndex}`, `entries[${index}].${bucketName}[${expressionIndex}]`, "Expressions must not be empty.");
        }
        void expressionKey;
      }
    }

    for (const [modifierIndex, modifier] of pattern.confidence_modifiers.entries()) {
      if (modifier.id.length === 0 || modifier.title.length === 0 || modifier.description.length === 0) {
        pushIssue(issues, "error", `entries.${index}.confidence_modifiers.${modifierIndex}`, `entries[${index}].confidence_modifiers[${modifierIndex}]`, "Confidence modifier fields are required.");
      }
      if (modifier.confidence < 0 || modifier.confidence > 100) {
        pushIssue(issues, "error", `entries.${index}.confidence_modifiers.${modifierIndex}.confidence`, `entries[${index}].confidence_modifiers[${modifierIndex}].confidence`, "Confidence value must be between 0 and 100.");
      }
    }

    const relationshipIds = new Set<string>();
    for (const [relationshipIndex, relationship] of pattern.glossary_relationships.entries()) {
      if (relationshipIds.has(relationship.id)) {
        pushIssue(issues, "error", `entries.${index}.glossary_relationships.${relationshipIndex}.id`, `entries[${index}].glossary_relationships[${relationshipIndex}].id`, `Duplicate relationship id "${relationship.id}".`);
      }
      relationshipIds.add(relationship.id);
      if (!conceptIds.has(relationship.from_concept_id)) {
        pushIssue(issues, "error", `entries.${index}.glossary_relationships.${relationshipIndex}.from_concept_id`, `entries[${index}].glossary_relationships[${relationshipIndex}].from_concept_id`, `Missing concept reference "${relationship.from_concept_id}".`);
      }
      if (!conceptIds.has(relationship.to_concept_id)) {
        pushIssue(issues, "error", `entries.${index}.glossary_relationships.${relationshipIndex}.to_concept_id`, `entries[${index}].glossary_relationships[${relationshipIndex}].to_concept_id`, `Missing concept reference "${relationship.to_concept_id}".`);
      }
      relationshipEdges.push([relationship.from_concept_id, relationship.to_concept_id]);
      if (!["parent", "child", "related", "opposite", "requires", "supports"].includes(relationship.relation)) {
        pushIssue(issues, "error", `entries.${index}.glossary_relationships.${relationshipIndex}.relation`, `entries[${index}].glossary_relationships[${relationshipIndex}].relation`, "Invalid relationship type.");
      }
    }

    const gcamIds = new Set<string>();
    for (const [mappingIndex, mapping] of pattern.gcam_mappings.entries()) {
      if (gcamIds.has(mapping.id)) {
        pushIssue(issues, "error", `entries.${index}.gcam_mappings.${mappingIndex}.id`, `entries[${index}].gcam_mappings[${mappingIndex}].id`, `Duplicate GCAM mapping id "${mapping.id}".`);
      }
      gcamIds.add(mapping.id);
      if (!Number.isFinite(mapping.article_id) || mapping.article_id <= 0) {
        pushIssue(issues, "error", `entries.${index}.gcam_mappings.${mappingIndex}.article_id`, `entries[${index}].gcam_mappings[${mappingIndex}].article_id`, "GCAM article id must be a positive number.");
      }
    }

    const exampleIds = new Set<string>();
    for (const [exampleIndex, example] of pattern.examples.entries()) {
      if (exampleIds.has(example.id)) {
        pushIssue(issues, "error", `entries.${index}.examples.${exampleIndex}.id`, `entries[${index}].examples[${exampleIndex}].id`, `Duplicate example id "${example.id}".`);
      }
      exampleIds.add(example.id);
      if (example.id.length === 0 || example.title.length === 0 || example.text.length === 0 || example.expected_outcome.length === 0) {
        pushIssue(issues, "error", `entries.${index}.examples.${exampleIndex}`, `entries[${index}].examples[${exampleIndex}]`, "Example fields are required.");
      }
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const [from, to] of relationshipEdges) {
    const bucket = adjacency.get(from) ?? new Set<string>();
    bucket.add(to);
    adjacency.set(from, bucket);
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
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...trail, node]);
    }
    active.delete(node);
  }
  for (const concept of document.metadata.concepts) {
    visit(concept.id, []);
  }
  for (const cycle of cycles) {
    pushIssue(issues, "error", "relationships.cycle", "entries", `Circular relationship detected: ${cycle.join(" -> ")}.`);
  }

  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message));
}

export function validatePatternLibraryDocument(document: PatternLibraryDocument): PatternLibraryValidationResult {
  const issues = validateDocument(document);
  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze([...issues]),
    hash: hashValue(document),
  });
}

export function loadPatternLibraryDocumentsFromDirectory(directoryPath: string): readonly PatternLibraryDocument[] {
  if (!statSafeIsDirectory(directoryPath)) {
    return Object.freeze([]);
  }
  const files = readdirSync(directoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => join(directoryPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
  return Object.freeze(files.map((file) => readDocument(file)));
}

function statSafeIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
