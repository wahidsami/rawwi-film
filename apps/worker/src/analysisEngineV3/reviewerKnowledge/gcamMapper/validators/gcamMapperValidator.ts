import { join } from "node:path";
import type {
  GcamMapperArticleMapping,
  GcamMapperAtomMapping,
  GcamMapperCatalog,
  GcamMapperRule,
  GcamMapperValidationIssue,
  GcamMapperValidationResult,
} from "../schemas/gcamMapperTypes.js";
import {
  compareGcamMapperVersions,
  hashGcamMapperValue,
  normalizeGcamMapperKey,
  normalizeGcamMapperText,
} from "../schemas/gcamMapperVersioning.js";
import { loadGcamMapperArticleDocument, loadGcamMapperAtomDocument, loadGcamMapperRuleDocument, type GcamMapperDocument } from "../schemas/gcamMapperSchema.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pushIssue(issues: GcamMapperValidationIssue[], severity: GcamMapperValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function validateTextList(issues: GcamMapperValidationIssue[], path: string, values: readonly string[] | unknown): void {
  if (!Array.isArray(values)) {
    pushIssue(issues, "error", `${path}.type`, path, "must be an array");
    return;
  }
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (typeof value !== "string" || normalizeGcamMapperText(value).length === 0) {
      pushIssue(issues, "error", `${path}.item`, `${path}[${index}]`, "must be a non-empty string");
      return;
    }
    const normalized = normalizeGcamMapperKey(value);
    if (seen.has(normalized)) {
      pushIssue(issues, "error", `${path}.duplicate`, `${path}[${index}]`, `Duplicate entry "${value}".`);
      return;
    }
    seen.add(normalized);
  });
}

function validateMatchCriteria(issues: GcamMapperValidationIssue[], path: string, match: unknown): void {
  if (!isPlainObject(match)) {
    pushIssue(issues, "error", `${path}.type`, path, "match must be an object");
    return;
  }
  validateTextList(issues, `${path}.concepts`, match.concepts);
  validateTextList(issues, `${path}.domains`, match.domains);
  validateTextList(issues, `${path}.targets`, match.targets);
  validateTextList(issues, `${path}.actions`, match.actions);
  validateTextList(issues, `${path}.intents`, match.intents);
  validateTextList(issues, `${path}.contexts`, match.contexts);
}

function validateArticleMapping(issues: GcamMapperValidationIssue[], mapping: GcamMapperArticleMapping, path: string): void {
  if (normalizeGcamMapperText(mapping.id).length === 0) pushIssue(issues, "error", "article.id.missing", `${path}.id`, "id is required");
  if (!/^\d+\.\d+\.\d+$/.test(normalizeGcamMapperText(mapping.version))) pushIssue(issues, "error", "article.version.invalid", `${path}.version`, "version must be semantic version");
  if (normalizeGcamMapperText(mapping.title).length === 0) pushIssue(issues, "error", "article.title.missing", `${path}.title`, "title is required");
  if (normalizeGcamMapperText(mapping.description).length === 0) pushIssue(issues, "warning", "article.description.missing", `${path}.description`, "description should be present");
  if (!Number.isInteger(mapping.articleId) || mapping.articleId <= 0) pushIssue(issues, "error", "article.articleId.invalid", `${path}.articleId`, "articleId must be a positive integer");
  if (normalizeGcamMapperText(mapping.articleNumber).length === 0) pushIssue(issues, "error", "article.articleNumber.missing", `${path}.articleNumber`, "articleNumber is required");
  if (normalizeGcamMapperText(mapping.articleTitleAr).length === 0) pushIssue(issues, "error", "article.articleTitleAr.missing", `${path}.articleTitleAr`, "articleTitleAr is required");
  if (normalizeGcamMapperText(mapping.findingTitle).length === 0) pushIssue(issues, "error", "article.findingTitle.missing", `${path}.findingTitle`, "findingTitle is required");
  if (normalizeGcamMapperText(mapping.findingCategory).length === 0) pushIssue(issues, "error", "article.findingCategory.missing", `${path}.findingCategory`, "findingCategory is required");
  validateTextList(issues, `${path}.concepts`, mapping.concepts);
  validateTextList(issues, `${path}.domains`, mapping.domains);
  validateTextList(issues, `${path}.targets`, mapping.targets);
  validateTextList(issues, `${path}.actions`, mapping.actions);
  validateTextList(issues, `${path}.intents`, mapping.intents);
  validateTextList(issues, `${path}.contexts`, mapping.contexts);
  validateTextList(issues, `${path}.relatedMappingIds`, mapping.relatedMappingIds);
  validateTextList(issues, `${path}.evidenceExamples`, mapping.evidenceExamples);
  if (normalizeGcamMapperText(mapping.reviewerExplanation).length === 0) pushIssue(issues, "warning", "article.reviewerExplanation.missing", `${path}.reviewerExplanation`, "reviewerExplanation should be present");
  if (normalizeGcamMapperText(mapping.mappingNotes).length === 0) pushIssue(issues, "warning", "article.mappingNotes.missing", `${path}.mappingNotes`, "mappingNotes should be present");
}

function validateAtomMapping(issues: GcamMapperValidationIssue[], mapping: GcamMapperAtomMapping, path: string): void {
  if (normalizeGcamMapperText(mapping.id).length === 0) pushIssue(issues, "error", "atom.id.missing", `${path}.id`, "id is required");
  if (!/^\d+\.\d+\.\d+$/.test(normalizeGcamMapperText(mapping.version))) pushIssue(issues, "error", "atom.version.invalid", `${path}.version`, "version must be semantic version");
  if (normalizeGcamMapperText(mapping.title).length === 0) pushIssue(issues, "error", "atom.title.missing", `${path}.title`, "title is required");
  if (normalizeGcamMapperText(mapping.description).length === 0) pushIssue(issues, "warning", "atom.description.missing", `${path}.description`, "description should be present");
  if (normalizeGcamMapperText(mapping.articleMappingId).length === 0) pushIssue(issues, "error", "atom.articleMappingId.missing", `${path}.articleMappingId`, "articleMappingId is required");
  if (!Number.isInteger(mapping.articleId) || mapping.articleId <= 0) pushIssue(issues, "error", "atom.articleId.invalid", `${path}.articleId`, "articleId must be a positive integer");
  if (normalizeGcamMapperText(mapping.articleNumber).length === 0) pushIssue(issues, "error", "atom.articleNumber.missing", `${path}.articleNumber`, "articleNumber is required");
  if (normalizeGcamMapperText(mapping.articleTitleAr).length === 0) pushIssue(issues, "error", "atom.articleTitleAr.missing", `${path}.articleTitleAr`, "articleTitleAr is required");
  if (normalizeGcamMapperText(mapping.atomId).length === 0) pushIssue(issues, "error", "atom.atomId.missing", `${path}.atomId`, "atomId is required");
  if (normalizeGcamMapperText(mapping.atomNumber).length === 0) pushIssue(issues, "error", "atom.atomNumber.missing", `${path}.atomNumber`, "atomNumber is required");
  if (normalizeGcamMapperText(mapping.atomTitleAr).length === 0) pushIssue(issues, "error", "atom.atomTitleAr.missing", `${path}.atomTitleAr`, "atomTitleAr is required");
  if (normalizeGcamMapperText(mapping.findingTitle).length === 0) pushIssue(issues, "error", "atom.findingTitle.missing", `${path}.findingTitle`, "findingTitle is required");
  if (normalizeGcamMapperText(mapping.findingCategory).length === 0) pushIssue(issues, "error", "atom.findingCategory.missing", `${path}.findingCategory`, "findingCategory is required");
  validateTextList(issues, `${path}.concepts`, mapping.concepts);
  validateTextList(issues, `${path}.domains`, mapping.domains);
  validateTextList(issues, `${path}.targets`, mapping.targets);
  validateTextList(issues, `${path}.actions`, mapping.actions);
  validateTextList(issues, `${path}.intents`, mapping.intents);
  validateTextList(issues, `${path}.contexts`, mapping.contexts);
  validateTextList(issues, `${path}.relatedMappingIds`, mapping.relatedMappingIds);
  validateTextList(issues, `${path}.evidenceExamples`, mapping.evidenceExamples);
  if (normalizeGcamMapperText(mapping.reviewerExplanation).length === 0) pushIssue(issues, "warning", "atom.reviewerExplanation.missing", `${path}.reviewerExplanation`, "reviewerExplanation should be present");
  if (normalizeGcamMapperText(mapping.mappingNotes).length === 0) pushIssue(issues, "warning", "atom.mappingNotes.missing", `${path}.mappingNotes`, "mappingNotes should be present");
}

function validateRule(issues: GcamMapperValidationIssue[], rule: GcamMapperRule, path: string): void {
  if (normalizeGcamMapperText(rule.id).length === 0) pushIssue(issues, "error", "rule.id.missing", `${path}.id`, "id is required");
  if (!/^\d+\.\d+\.\d+$/.test(normalizeGcamMapperText(rule.version))) pushIssue(issues, "error", "rule.version.invalid", `${path}.version`, "version must be semantic version");
  if (normalizeGcamMapperText(rule.title).length === 0) pushIssue(issues, "error", "rule.title.missing", `${path}.title`, "title is required");
  if (normalizeGcamMapperText(rule.description).length === 0) pushIssue(issues, "warning", "rule.description.missing", `${path}.description`, "description should be present");
  if (!Number.isInteger(rule.priority) || rule.priority < 0) pushIssue(issues, "error", "rule.priority.invalid", `${path}.priority`, "priority must be a non-negative integer");
  validateMatchCriteria(issues, `${path}.match`, rule.match);
  if (normalizeGcamMapperText(rule.articleMappingId).length === 0) pushIssue(issues, "error", "rule.articleMappingId.missing", `${path}.articleMappingId`, "articleMappingId is required");
  if (rule.atomMappingId !== null && normalizeGcamMapperText(rule.atomMappingId).length === 0) pushIssue(issues, "error", "rule.atomMappingId.invalid", `${path}.atomMappingId`, "atomMappingId must be null or a non-empty string");
  validateTextList(issues, `${path}.relatedRuleIds`, rule.relatedRuleIds);
  if (normalizeGcamMapperText(rule.debtNote).length === 0) pushIssue(issues, "warning", "rule.debtNote.missing", `${path}.debtNote`, "debtNote should be present");
}

function validateVersionConsistency(issues: GcamMapperValidationIssue[], documents: readonly GcamMapperDocument<unknown>[]): void {
  if (documents.length === 0) return;
  const versions = documents.map((document) => normalizeGcamMapperText(document.version));
  const first = versions[0];
  for (const [index, version] of versions.entries()) {
    if (compareGcamMapperVersions(version, first) !== 0) {
      pushIssue(issues, "error", "version.mismatch", `documents[${index}].version`, `Version mismatch detected: "${version}" does not match "${first}".`);
    }
  }
}

function detectCycles(graph: Map<string, readonly string[]>): readonly string[][] {
  const visited = new Set<string>();
  const active = new Set<string>();
  const cycles: string[][] = [];

  function visit(node: string, path: string[]): void {
    if (active.has(node)) {
      const start = path.indexOf(node);
      cycles.push(start >= 0 ? path.slice(start).concat(node) : [...path, node]);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    for (const next of graph.get(node) ?? []) {
      visit(next, [...path, node]);
    }
    active.delete(node);
  }

  for (const node of graph.keys()) {
    visit(node, []);
  }

  return cycles;
}

export function validateGcamMapperCatalog(catalog: GcamMapperCatalog): GcamMapperValidationResult {
  const issues: GcamMapperValidationIssue[] = [];
  const seenIds = new Set<string>();

  const articleIdByKey = new Map<string, GcamMapperArticleMapping>();
  const atomIdByKey = new Map<string, GcamMapperAtomMapping>();
  const ruleIdByKey = new Map<string, GcamMapperRule>();

  for (const [index, mapping] of catalog.articleMappings.entries()) {
    validateArticleMapping(issues, mapping, `articleMappings[${index}]`);
    const normalized = normalizeGcamMapperKey(mapping.id);
    if (seenIds.has(normalized)) pushIssue(issues, "error", "duplicate.article.id", `articleMappings[${index}].id`, `Duplicate mapping id "${mapping.id}".`);
    seenIds.add(normalized);
    articleIdByKey.set(normalized, mapping);
  }

  for (const [index, mapping] of catalog.atomMappings.entries()) {
    validateAtomMapping(issues, mapping, `atomMappings[${index}]`);
    const normalized = normalizeGcamMapperKey(mapping.id);
    if (seenIds.has(normalized)) pushIssue(issues, "error", "duplicate.atom.id", `atomMappings[${index}].id`, `Duplicate mapping id "${mapping.id}".`);
    seenIds.add(normalized);
    atomIdByKey.set(normalized, mapping);
  }

  for (const [index, rule] of catalog.mappingRules.entries()) {
    validateRule(issues, rule, `mappingRules[${index}]`);
    const normalized = normalizeGcamMapperKey(rule.id);
    if (seenIds.has(normalized)) pushIssue(issues, "error", "duplicate.rule.id", `mappingRules[${index}].id`, `Duplicate mapping id "${rule.id}".`);
    seenIds.add(normalized);
    ruleIdByKey.set(normalized, rule);
  }

  validateVersionConsistency(issues, [
    { schema_version: 1, version: catalog.version, id: "catalog", title: "catalog", description: "catalog", entries: [] },
    ...catalog.articleMappings.map((entry) => ({ schema_version: 1 as const, version: entry.version, id: entry.id, title: entry.title, description: entry.description, entries: [] })),
    ...catalog.atomMappings.map((entry) => ({ schema_version: 1 as const, version: entry.version, id: entry.id, title: entry.title, description: entry.description, entries: [] })),
    ...catalog.mappingRules.map((entry) => ({ schema_version: 1 as const, version: entry.version, id: entry.id, title: entry.title, description: entry.description, entries: [] })),
  ]);

  for (const [index, mapping] of catalog.atomMappings.entries()) {
    const articleRef = articleIdByKey.get(normalizeGcamMapperKey(mapping.articleMappingId));
    if (!articleRef) {
      pushIssue(issues, "error", "reference.articleMapping.missing", `atomMappings[${index}].articleMappingId`, `Unknown article mapping reference: ${mapping.articleMappingId}`);
    } else if (articleRef.articleId !== mapping.articleId) {
      pushIssue(issues, "error", "reference.articleMapping.mismatch", `atomMappings[${index}].articleId`, `Atom articleId ${mapping.articleId} does not match article mapping ${articleRef.articleId}.`);
    }
  }

  for (const [index, rule] of catalog.mappingRules.entries()) {
    if (!articleIdByKey.has(normalizeGcamMapperKey(rule.articleMappingId))) {
      pushIssue(issues, "error", "reference.articleMapping.missing", `mappingRules[${index}].articleMappingId`, `Unknown article mapping reference: ${rule.articleMappingId}`);
    }
    if (rule.atomMappingId !== null && !atomIdByKey.has(normalizeGcamMapperKey(rule.atomMappingId))) {
      pushIssue(issues, "error", "reference.atomMapping.missing", `mappingRules[${index}].atomMappingId`, `Unknown atom mapping reference: ${rule.atomMappingId}`);
    }
    for (const [relatedIndex, relatedId] of rule.relatedRuleIds.entries()) {
      if (!ruleIdByKey.has(normalizeGcamMapperKey(relatedId))) {
        pushIssue(issues, "error", "reference.rule.missing", `mappingRules[${index}].relatedRuleIds[${relatedIndex}]`, `Unknown related rule reference: ${relatedId}`);
      }
    }
  }

  const adjacency = new Map<string, readonly string[]>();
  for (const rule of catalog.mappingRules) {
    adjacency.set(rule.id, rule.relatedRuleIds);
  }
  for (const cycle of detectCycles(adjacency)) {
    pushIssue(issues, "error", "relationships.cycle", "mappingRules", `Circular mapping detected: ${cycle.join(" -> ")}.`);
  }

  const hash = hashGcamMapperValue({
    version: catalog.version,
    articleMappings: catalog.articleMappings,
    atomMappings: catalog.atomMappings,
    mappingRules: catalog.mappingRules,
  });

  return Object.freeze({
    valid: issues.filter((issue) => issue.severity === "error").length === 0,
    issues: Object.freeze(issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))),
    hash,
  });
}

export function loadGcamMapperCatalogFromRoot(rootDir: string): GcamMapperCatalog {
  const articleDocument = loadGcamMapperArticleDocument(join(rootDir, "articleMappings", "articleMappings.v1.json"));
  const atomDocument = loadGcamMapperAtomDocument(join(rootDir, "atomMappings", "atomMappings.v1.json"));
  const ruleDocument = loadGcamMapperRuleDocument(join(rootDir, "mappingRules", "mappingRules.v1.json"));

  return Object.freeze({
    version: articleDocument.version,
    articleMappings: Object.freeze([...articleDocument.entries].sort((left, right) => left.id.localeCompare(right.id))),
    atomMappings: Object.freeze([...atomDocument.entries].sort((left, right) => left.id.localeCompare(right.id))),
    mappingRules: Object.freeze([...ruleDocument.entries].sort((left, right) => left.id.localeCompare(right.id))),
  });
}
