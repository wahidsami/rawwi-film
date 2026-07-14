import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { parseReviewerKnowledgeDocumentText } from "../../reviewerKnowledgeIO.js";
import { parseKnowledgeAcquisitionDocumentText } from "../schema/knowledgeAcquisitionSchema.js";
import {
  createKnowledgeAcquisitionRecordDocument,
  deriveKnowledgeAcquisitionId,
  normalizeKnowledgeAcquisitionDocumentInput,
  parseKnowledgeAcquisitionRecord,
} from "../schema/knowledgeAcquisitionSchema.js";
import { normalizeKnowledgeAcquisitionText } from "../schema/knowledgeAcquisitionVersioning.js";
import type {
  KnowledgeAcquisitionDocumentInput,
  KnowledgeAcquisitionKnowledgeType,
  KnowledgeAcquisitionRecord,
  KnowledgeAcquisitionRecordDocument,
} from "../schema/knowledgeAcquisitionTypes.js";

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function discoverKnowledgeFiles(rootDir: string): readonly string[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);
  const files: string[] = [];
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !isDirectory(current)) continue;
    const entries = readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && /\.(?:json|ya?ml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

export function classifyKnowledgeAcquisitionType(input: string): KnowledgeAcquisitionKnowledgeType | string {
  const normalized = normalizeKnowledgeAcquisitionText(input).toLowerCase();
  if (normalized.includes("observation")) return "reviewer_observation";
  if (normalized.includes("correction")) return "reviewer_correction";
  if (normalized.includes("disagreement")) return "reviewer_disagreement";
  if (normalized.includes("consensus")) return "reviewer_consensus";
  if (normalized.includes("finding")) return "reviewer_finding";
  if (normalized.includes("explanation")) return "reviewer_explanation";
  if (normalized.includes("rationale")) return "reviewer_rationale";
  if (normalized.includes("exception")) return "reviewer_exception";
  if (normalized.includes("interpretation")) return "reviewer_interpretation";
  if (normalized.includes("edge case")) return "reviewer_edge_case";
  if (normalized.includes("dialect")) return "reviewer_dialect_note";
  if (normalized.includes("cultural")) return "reviewer_cultural_note";
  if (normalized.includes("historical")) return "reviewer_historical_note";
  if (normalized.includes("religious")) return "reviewer_religious_note";
  if (normalized.includes("political")) return "reviewer_political_note";
  if (normalized.includes("visual")) return "reviewer_visual_note";
  if (normalized.includes("storytelling")) return "reviewer_storytelling_note";
  if (normalized.includes("hidden meaning")) return "reviewer_hidden_meaning_note";
  if (normalized.includes("symbolism") || normalized.includes("symbolic")) return "reviewer_symbolism_note";
  return normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "reviewer_comment";
}

export function extractKnowledgeAcquisitionRecord(input: unknown): KnowledgeAcquisitionRecord {
  const record = parseKnowledgeAcquisitionRecord(input);
  return Object.freeze({
    ...record,
    id: deriveKnowledgeAcquisitionId(record),
  });
}

export function extractKnowledgeAcquisitionDocuments(input: KnowledgeAcquisitionDocumentInput | readonly KnowledgeAcquisitionDocumentInput[]): readonly KnowledgeAcquisitionRecordDocument[] {
  const inputs = Array.isArray(input) ? input : [input];
  const documents: KnowledgeAcquisitionRecordDocument[] = [];
  for (const item of inputs) {
    const parsed = normalizeKnowledgeAcquisitionDocumentInput(item);
    for (const record of parsed) {
      const normalized = extractKnowledgeAcquisitionRecord(record);
      documents.push(createKnowledgeAcquisitionRecordDocument(normalized));
    }
  }
  return Object.freeze(documents.sort((left, right) => left.record.id.localeCompare(right.record.id)));
}

export function loadKnowledgeAcquisitionRecordsFromDirectory(rootDir: string): readonly KnowledgeAcquisitionRecord[] {
  const records: KnowledgeAcquisitionRecord[] = [];
  for (const filePath of discoverKnowledgeFiles(rootDir)) {
    const parsed = parseKnowledgeAcquisitionDocumentText(readFileSync(filePath, "utf8"));
    for (const record of parsed) {
      records.push(extractKnowledgeAcquisitionRecord(record));
    }
  }
  return Object.freeze(records.sort((left, right) => left.id.localeCompare(right.id)));
}

export function inferKnowledgeAcquisitionCategory(record: KnowledgeAcquisitionRecord): string {
  const normalized = normalizeKnowledgeAcquisitionText(record.knowledgeType).toLowerCase();
  if (normalized.includes("observation")) return "reviewerObservations";
  if (normalized.includes("correction")) return "reviewerCorrections";
  if (normalized.includes("disagreement")) return "reviewerDisagreements";
  if (normalized.includes("finding")) return "reviewerExamples";
  if (normalized.includes("note")) return "reviewerNotes";
  return "knowledgeAssets";
}
