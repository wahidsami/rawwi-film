import { hashKnowledgeRegistryValue, normalizeKnowledgeRegistryId, normalizeKnowledgeRegistryText } from "./knowledgeRegistryUtils.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryValidationIssue, KnowledgeRegistryValidationResult } from "./knowledgeRegistryTypes.js";

function pushIssue(issues: KnowledgeRegistryValidationIssue[], severity: KnowledgeRegistryValidationIssue["severity"], code: string, path: string, message: string): void {
  issues.push(Object.freeze({ severity, code, path, message }));
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === "string" && normalizeKnowledgeRegistryText(value).length > 0;
}

export function validateKnowledgeRegistryEntries(entries: readonly KnowledgeRegistryEntry[]): KnowledgeRegistryValidationResult {
  const issues: KnowledgeRegistryValidationIssue[] = [];
  const seenIdentityKeys = new Set<string>();
  const entriesByMetadataId = new Map<string, string[]>();
  const adjacency = new Map<string, Set<string>>();

  for (const [index, entry] of entries.entries()) {
    const path = `entries[${index}]`;

    const identityKey = `${entry.metadata.kind}:${normalizeKnowledgeRegistryId(entry.metadata.id)}:${normalizeKnowledgeRegistryId(entry.metadata.version ?? "")}`;
    if (seenIdentityKeys.has(identityKey)) {
      pushIssue(issues, "error", "metadata.id.duplicate", `${path}.metadata.id`, `Duplicate knowledge id "${entry.metadata.id}" for kind "${entry.metadata.kind}".`);
    }
    seenIdentityKeys.add(identityKey);
    const bucket = entriesByMetadataId.get(normalizeKnowledgeRegistryId(entry.metadata.id)) ?? [];
    bucket.push(entry.registryKey);
    entriesByMetadataId.set(normalizeKnowledgeRegistryId(entry.metadata.id), bucket);

    if (!isNonEmptyString(entry.metadata.id)) {
      pushIssue(issues, "error", "metadata.id.missing", `${path}.metadata.id`, "Knowledge metadata id is required.");
    }
    if (!isNonEmptyString(entry.metadata.title)) {
      pushIssue(issues, "error", "metadata.title.missing", `${path}.metadata.title`, "Knowledge metadata title is required.");
    }
    if (!isNonEmptyString(entry.metadata.description)) {
      pushIssue(issues, "error", "metadata.description.missing", `${path}.metadata.description`, "Knowledge metadata description is required.");
    }

    if (!isNonEmptyString(entry.traceability.sourceKind)) {
      pushIssue(issues, "error", "traceability.sourceKind.missing", `${path}.traceability.sourceKind`, "Traceability source kind is required.");
    }

    for (const relatedId of entry.metadata.relatedIds) {
      const relatedKeys = relatedId.includes(":")
        ? [relatedId]
        : (entriesByMetadataId.get(normalizeKnowledgeRegistryId(relatedId)) ?? []);
      if (relatedKeys.length === 0) {
        pushIssue(issues, "warning", "references.missing", `${path}.metadata.relatedIds`, `Missing related knowledge entry "${relatedId}".`);
        continue;
      }

      const bucket = adjacency.get(entry.registryKey) ?? new Set<string>();
      for (const relatedKey of relatedKeys) {
        bucket.add(relatedKey);
      }
      adjacency.set(entry.registryKey, bucket);
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
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...trail, node]);
    }
    active.delete(node);
  }

  for (const entry of entries) {
    visit(entry.registryKey, []);
  }

  for (const cycle of cycles) {
    const uniqueNodeCount = new Set(cycle).size;
    if (uniqueNodeCount <= 2) {
      continue;
    }
    pushIssue(issues, "error", "relationships.cycle", "relationships", `Circular knowledge relationship detected: ${cycle.join(" -> ")}.`);
  }

  const incomingCounts = new Map<string, number>();
  for (const targets of adjacency.values()) {
    for (const target of targets) {
      incomingCounts.set(target, (incomingCounts.get(target) ?? 0) + 1);
    }
  }

  let orphanCount = 0;
  for (const entry of entries) {
    const outgoing = adjacency.get(entry.registryKey)?.size ?? 0;
    const incoming = incomingCounts.get(entry.registryKey) ?? 0;
    if (incoming === 0 && outgoing === 0) {
      orphanCount += 1;
      pushIssue(issues, "warning", "relationships.orphan", `${entry.registryKey}`, "Knowledge entry has no linked references.");
    }
  }

  const valid = !issues.some((issue) => issue.severity === "error");
  return Object.freeze({
    valid,
    issues: Object.freeze(issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code) || left.message.localeCompare(right.message))),
    hash: hashKnowledgeRegistryValue({ entries: entries.map((entry) => entry.registryKey).sort((left, right) => left.localeCompare(right)), issues }),
  });
}
