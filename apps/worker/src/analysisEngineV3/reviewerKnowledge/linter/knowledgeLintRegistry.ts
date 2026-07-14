import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseReviewerAcademyPackDocumentText } from "../academy/reviewerAcademyIndex.js";
import type { ReviewerAcademyPackDocument } from "../academy/reviewerAcademyTypes.js";
import type { KnowledgeLintPack, KnowledgeLintRegistryEntry, KnowledgeLintReport } from "./knowledgeLintTypes.js";
import { convertAcademyDocumentToLintPack, buildKnowledgeLintReport } from "./knowledgeLintValidator.js";

const PACK_FILENAMES = Object.freeze(["pack.v1.json", "pack.v1.yaml", "pack.v1.yml"]);

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeId(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export class KnowledgeLintRegistry {
  private readonly entries = new Map<string, KnowledgeLintRegistryEntry>();

  constructor(entries: readonly KnowledgeLintRegistryEntry[] = []) {
    for (const entry of entries) {
      this.register(entry.pack);
    }
  }

  register(pack: KnowledgeLintPack): this {
    const report = buildKnowledgeLintReport(pack);
    if (!report.overallScore.readyForAcademy) {
      const message = report.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid knowledge pack: ${message}`);
    }
    this.entries.set(normalizeId(pack.metadata.id), Object.freeze({ pack, report }));
    return this;
  }

  unregister(packId: string): boolean {
    return this.entries.delete(normalizeId(packId));
  }

  load(packId: string): KnowledgeLintRegistryEntry | null {
    return this.entries.get(normalizeId(packId)) ?? null;
  }

  list(): readonly KnowledgeLintRegistryEntry[] {
    return Object.freeze([...this.entries.values()].sort((left, right) => left.pack.metadata.id.localeCompare(right.pack.metadata.id)));
  }
}

export function createKnowledgeLintRegistry(entries?: readonly KnowledgeLintRegistryEntry[]): KnowledgeLintRegistry {
  return new KnowledgeLintRegistry(entries);
}

export function loadKnowledgeLintRegistryFromAcademy(rootDir: string): KnowledgeLintRegistry {
  if (!isDirectory(rootDir)) {
    return new KnowledgeLintRegistry([]);
  }

  const entries: KnowledgeLintRegistryEntry[] = [];
  const folders = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const folder of folders) {
    const folderPath = join(rootDir, folder);
    const fileCandidates = PACK_FILENAMES.map((fileName) => join(folderPath, fileName)).filter((filePath) => existsSync(filePath));
    if (fileCandidates.length === 0) continue;
    const filePath = fileCandidates.sort((left, right) => left.localeCompare(right))[0];
    if (!filePath) continue;

    const parsed = parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8")) as ReviewerAcademyPackDocument;
    const lintPack = convertAcademyDocumentToLintPack(parsed, filePath);
    const report = buildKnowledgeLintReport(lintPack);
    if (!report.overallScore.readyForAcademy) continue;
    entries.push(Object.freeze({ pack: lintPack, report }));
  }

  return new KnowledgeLintRegistry(entries);
}
