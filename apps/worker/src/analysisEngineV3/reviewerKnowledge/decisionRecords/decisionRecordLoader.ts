import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseDecisionRecord } from "./decisionRecordSchema.js";
import type { DecisionRecord } from "./decisionRecordTypes.js";

const DECISION_RECORD_FILE_PATTERN = /^decision.*\.v\d+\.json$/i;

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function discoverDecisionRecordFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const files: string[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...discoverDecisionRecordFiles(fullPath));
      continue;
    }
    if (DECISION_RECORD_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export function loadDecisionRecordFromFile(filePath: string): DecisionRecord {
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (Array.isArray(parsed)) {
    throw new Error(`Decision record files must contain a single record or a bundle object: ${filePath}`);
  }
  if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { records?: unknown[] }).records)) {
    const first = (parsed as { records: unknown[] }).records[0];
    if (!first || typeof first !== "object") {
      throw new Error(`Decision record bundle is empty: ${filePath}`);
    }
    return parseDecisionRecord(first);
  }
  return parseDecisionRecord(parsed);
}

export function loadDecisionRecordsFromDirectory(directoryPath: string): readonly DecisionRecord[] {
  const records: DecisionRecord[] = [];
  for (const filePath of discoverDecisionRecordFiles(directoryPath)) {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { records?: unknown[] }).records)) {
      for (const record of (parsed as { records: unknown[] }).records) {
        records.push(parseDecisionRecord(record));
      }
      continue;
    }
    records.push(loadDecisionRecordFromFile(filePath));
  }
  return Object.freeze(records);
}

export function loadDecisionRecordsFromExamples(directoryPath: string): readonly DecisionRecord[] {
  return loadDecisionRecordsFromDirectory(directoryPath);
}
