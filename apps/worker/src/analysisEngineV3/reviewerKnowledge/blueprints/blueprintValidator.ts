import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BlueprintDocument, BlueprintEntry, BlueprintRelationship, BlueprintValidationIssue, BlueprintValidationResult } from "./blueprintTypes.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function isBlueprintRelationship(entry: unknown): entry is BlueprintRelationship {
  return isPlainObject(entry)
    && typeof entry.from === "string"
    && typeof entry.to === "string"
    && typeof entry.type === "string";
}

function isBlueprintEntry(entry: unknown): entry is BlueprintEntry {
  return isPlainObject(entry)
    && typeof entry.id === "string"
    && typeof entry.title === "string"
    && typeof entry.description === "string"
    && !("from" in entry)
    && !("to" in entry)
    && !("type" in entry);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashDocument(document: BlueprintDocument): string {
  return createHash("sha256").update(stableSerialize(document), "utf8").digest("hex");
}

function pushIssue(issues: BlueprintValidationIssue[], severity: BlueprintValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function loadDocument(filePath: string): BlueprintDocument {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid blueprint document: ${filePath}`);
  }

  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return Object.freeze({
    version: normalizeText(String(parsed.version ?? "")),
    id: normalizeText(String(parsed.id ?? "")),
    title: normalizeText(String(parsed.title ?? "")),
    description: normalizeText(String(parsed.description ?? "")),
    entries: Object.freeze(entries.map((entry) => isPlainObject(entry) ? Object.freeze({
      ...entry,
      id: typeof entry.id === "string" ? normalizeText(entry.id) : undefined,
      title: typeof entry.title === "string" ? normalizeText(entry.title) : undefined,
      description: typeof entry.description === "string" ? normalizeText(entry.description) : undefined,
      from: typeof entry.from === "string" ? normalizeText(entry.from) : undefined,
      to: typeof entry.to === "string" ? normalizeText(entry.to) : undefined,
      type: typeof entry.type === "string" ? normalizeText(entry.type) : undefined,
    }) : entry)),
  });
}

export function validateBlueprints(directory: string): BlueprintValidationResult {
  const files = [
    "domain.json",
    "concepts.json",
    "actions.json",
    "targets.json",
    "contexts.json",
    "intents.json",
    "evidence.json",
    "relationships.json",
    "reviewQuestions.json",
  ].map((file) => join(directory, file));

  const documents = files.map((file) => loadDocument(file));
  const issues: BlueprintValidationIssue[] = [];
  const ids = new Set<string>();
  const allEntryIds = new Set<string>();
  const relationshipEntries: BlueprintRelationship[] = [];

  for (const [index, document] of documents.entries()) {
    if (document.version !== "1.0.0") {
      pushIssue(issues, "error", `document.${index}.version`, `documents[${index}].version`, "Blueprint version must be 1.0.0.");
    }
    if (ids.has(document.id)) {
      pushIssue(issues, "error", `document.${index}.id`, `documents[${index}].id`, `Duplicate blueprint id.`);
    }
    ids.add(document.id);

    for (const [entryIndex, entry] of document.entries.entries()) {
      if (isBlueprintRelationship(entry)) {
        relationshipEntries.push(entry as BlueprintRelationship);
        continue;
      }
      if (!isBlueprintEntry(entry)) {
        pushIssue(issues, "error", `document.${index}.entries.${entryIndex}`, `documents[${index}].entries[${entryIndex}]`, "Entries must define id, title, and description.");
        continue;
      }
      if (allEntryIds.has(entry.id)) {
        pushIssue(issues, "error", `document.${index}.entries.${entryIndex}.id`, `documents[${index}].entries[${entryIndex}].id`, `Duplicate entry id "${entry.id}".`);
      }
      allEntryIds.add(entry.id);
    }
  }

  const knownIds = new Set(allEntryIds);
  for (const [index, relationship] of relationshipEntries.entries()) {
    if (!["parent", "child", "related", "opposite", "requires", "supports"].includes(relationship.type)) {
      pushIssue(issues, "error", `relationship.${index}.type`, `relationships[${index}].type`, "Invalid relationship type.");
    }
    if (!knownIds.has(relationship.from)) {
      pushIssue(issues, "error", `relationship.${index}.from`, `relationships[${index}].from`, `Missing relationship source reference.`);
    }
    if (!knownIds.has(relationship.to)) {
      pushIssue(issues, "error", `relationship.${index}.to`, `relationships[${index}].to`, `Missing relationship target reference.`);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const relationship of relationshipEntries) {
    const bucket = adjacency.get(relationship.from) ?? new Set<string>();
    bucket.add(relationship.to);
    adjacency.set(relationship.from, bucket);
  }

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
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...path, node]);
    }
    active.delete(node);
  }

  for (const id of knownIds) {
    visit(id, []);
  }

  for (const cycle of cycles) {
    pushIssue(issues, "error", "relationships.cycle", "relationships", `Circular relationship detected: ${cycle.join(" -> ")}.`);
  }

  const hash = hashDocument({ version: "1.0.0", id: "blueprint_manifest", title: "Blueprint Manifest", description: "Deterministic blueprint validation manifest", entries: documents.flatMap((document) => document.entries) });
  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))),
    hash,
  });
}
