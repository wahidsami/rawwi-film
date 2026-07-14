import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { createReviewerAcademyIndex, parseReviewerAcademyPackDocumentText } from "./reviewerAcademyIndex.js";
import type { ReviewerAcademyIndex, ReviewerAcademyPackDocument } from "./reviewerAcademyTypes.js";
import { lintAcademyPackDocument } from "../linter/knowledgeLinter.js";

const ACADEMY_PACK_FILE_NAMES = Object.freeze(["pack.v1.json", "pack.v1.yaml", "pack.v1.yml"]);

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function discoverAcademyPackDocuments(rootDir: string): readonly ReviewerAcademyPackDocument[] {
  if (!isDirectory(rootDir)) {
    return [];
  }

  const documents: ReviewerAcademyPackDocument[] = [];
  const folders = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const folder of folders) {
    const folderPath = join(rootDir, folder);
    const fileCandidates = ACADEMY_PACK_FILE_NAMES.map((name) => join(folderPath, name)).filter((filePath) => existsSync(filePath));
    if (fileCandidates.length === 0) {
      continue;
    }

    const filePath = fileCandidates.sort((left, right) => left.localeCompare(right))[0];
    if (!filePath) {
      continue;
    }

    const parsed = parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8"));
    const lintReport = lintAcademyPackDocument(parsed, filePath);
    if (!lintReport.overallScore.readyForAcademy) {
      continue;
    }
    documents.push(parsed);
  }

  return Object.freeze(documents);
}

export class ReviewerAcademyLoader {
  constructor(private readonly rootDir: string) {}

  loadIndex(): ReviewerAcademyIndex {
    const documents = discoverAcademyPackDocuments(this.rootDir);
    return createReviewerAcademyIndex(this.rootDir, documents);
  }

  loadPacks(): readonly ReviewerKnowledgePack[] {
    return this.loadIndex().packs;
  }

  loadDocuments(): readonly ReviewerAcademyPackDocument[] {
    return this.loadIndex().documents;
  }
}

export function createReviewerAcademyLoader(rootDir: string): ReviewerAcademyLoader {
  return new ReviewerAcademyLoader(rootDir);
}

export function loadReviewerAcademyIndex(rootDir: string): ReviewerAcademyIndex {
  return createReviewerAcademyLoader(rootDir).loadIndex();
}

export function loadReviewerAcademyPacks(rootDir: string): readonly ReviewerKnowledgePack[] {
  return loadReviewerAcademyIndex(rootDir).packs;
}
