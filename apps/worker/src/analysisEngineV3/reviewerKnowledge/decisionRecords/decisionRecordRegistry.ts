import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadDecisionRecordsFromExamples } from "./decisionRecordLoader.js";
import { searchDecisionRecords } from "./decisionRecordSearch.js";
import { validateDecisionRecords } from "./decisionRecordValidator.js";
import type {
  DecisionRecord,
  DecisionRecordRegistry,
  DecisionRecordRegistryValidation,
  DecisionRecordSearchQuery,
} from "./decisionRecordTypes.js";

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const DEFAULT_ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "examples");
let cachedDefaultDecisionRecordRegistry: DecisionRecordRegistry | null = null;

function sortRecords(records: readonly DecisionRecord[]): readonly DecisionRecord[] {
  return Object.freeze(
    [...records].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version) || left.title.localeCompare(right.title)),
  );
}

function computeRegistryValidation(records: readonly DecisionRecord[], rootDir: string): DecisionRecordRegistryValidation {
  const validation = validateDecisionRecords(records, { rootDir });
  const recordHashes = [...records].map((record) => hashText(JSON.stringify(record))).sort((left, right) => left.localeCompare(right));
  const hash = hashText(JSON.stringify({ recordHashes, validationHash: validation.hash }));
  return Object.freeze({
    valid: validation.valid,
    issues: validation.issues,
    hash,
    recordHashes: Object.freeze(recordHashes),
  });
}

export function createDecisionRecordRegistry(rootDir = DEFAULT_ROOT_DIR): DecisionRecordRegistry {
  if (rootDir === DEFAULT_ROOT_DIR && cachedDefaultDecisionRecordRegistry) {
    return cachedDefaultDecisionRecordRegistry;
  }

  let records = sortRecords(loadDecisionRecordsFromExamples(rootDir));
  let validation = computeRegistryValidation(records, rootDir);

  const refresh = (): void => {
    records = sortRecords(records);
    validation = computeRegistryValidation(records, rootDir);
  };

  const registry = Object.freeze({
    rootDir,
    get records(): readonly DecisionRecord[] {
      return Object.freeze([...records]);
    },
    get validation() {
      return validation;
    },
    get hash() {
      return validation.hash;
    },
    list: () => Object.freeze([...records]),
    get: (id: string) => records.find((record) => record.id === id) ?? null,
    register: (record: DecisionRecord) => {
      records = Object.freeze([...records.filter((existing) => existing.id !== record.id), record]);
      refresh();
    },
    unregister: (id: string) => {
      records = Object.freeze(records.filter((record) => record.id !== id));
      refresh();
    },
    search: (query: DecisionRecordSearchQuery) => searchDecisionRecords(records, query),
  });

  if (rootDir === DEFAULT_ROOT_DIR) {
    cachedDefaultDecisionRecordRegistry = registry;
  }

  return registry;
}
