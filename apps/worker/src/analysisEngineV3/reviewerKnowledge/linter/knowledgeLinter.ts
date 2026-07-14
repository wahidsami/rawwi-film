import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReviewerAcademyPackDocumentText } from "../academy/reviewerAcademyIndex.js";
import type { ReviewerAcademyPackDocument } from "../academy/reviewerAcademyTypes.js";
import type { KnowledgeLintPack, KnowledgeLintReport } from "./knowledgeLintTypes.js";
import { convertAcademyDocumentToLintPack, buildKnowledgeLintReport } from "./knowledgeLintValidator.js";
import { loadKnowledgeLintRegistryFromAcademy, KnowledgeLintRegistry } from "./knowledgeLintRegistry.js";

export function lintKnowledgePack(pack: KnowledgeLintPack): KnowledgeLintReport {
  return buildKnowledgeLintReport(pack);
}

export function lintAcademyPackDocument(document: ReviewerAcademyPackDocument, sourcePath: string | null): KnowledgeLintReport {
  return buildKnowledgeLintReport(convertAcademyDocumentToLintPack(document, sourcePath));
}

export function lintAcademyPackFile(filePath: string): KnowledgeLintReport {
  const parsed = parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8")) as ReviewerAcademyPackDocument;
  return lintAcademyPackDocument(parsed, filePath);
}

export function lintAcademyDirectory(directoryPath: string): KnowledgeLintRegistry {
  return loadKnowledgeLintRegistryFromAcademy(directoryPath);
}

export function lintAcademyFileInDirectory(directoryPath: string, fileName: string): KnowledgeLintReport {
  return lintAcademyPackFile(join(directoryPath, fileName));
}

