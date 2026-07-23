import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureReviewerAcademyRegistry } from "../analysisEngineV3/reviewerCompiler/compilerLoader.js";

export type ReviewerAcademyMarkdownDocument = Readonly<{
  articleId: string;
  filePath: string;
  title: string;
  content: string;
  characterCount: number;
}>;

export type ReviewerAcademyKnowledgePrompt = Readonly<{
  universalProtocol: ReviewerAcademyMarkdownDocument;
  articleDocuments: readonly ReviewerAcademyMarkdownDocument[];
  filePaths: readonly string[];
  characterCount: number;
  section: string;
}>;

type KnowledgeManifestEntry = Readonly<{
  articleId: number;
  markdownFilename: string;
}>;

type KnowledgeManifest = Readonly<{
  version?: string;
  articles: readonly KnowledgeManifestEntry[];
}>;

function normalizeArticleId(value: string): string {
  const normalized = value.trim().toLowerCase();
  const numericMatch = normalized.match(/(\d+)/u);
  if (!numericMatch) {
    return normalized;
  }

  const parsed = Number.parseInt(numericMatch[1] ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return normalized;
  }

  return `article_${String(parsed).padStart(2, "0")}`;
}

function compareArticleIds(left: string, right: string): number {
  const leftMatch = left.match(/(\d+)/u);
  const rightMatch = right.match(/(\d+)/u);
  const leftNumber = leftMatch ? Number.parseInt(leftMatch[1] ?? "", 10) : Number.NaN;
  const rightNumber = rightMatch ? Number.parseInt(rightMatch[1] ?? "", 10) : Number.NaN;

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function resolveKnowledgeRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = Object.freeze([
    join(moduleDirectory, "..", "..", "knowledge"),
    join(process.cwd(), "apps", "worker", "knowledge"),
    "/app/apps/worker/knowledge",
  ]);

  for (const candidate of candidates) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Worker knowledge root not found. Checked: ${candidates.join(", ")}`);
}

function resolveKnowledgeManifestPath(): string {
  return join(resolveKnowledgeRoot(), "knowledgeManifest.json");
}

let cachedKnowledgeManifest: KnowledgeManifest | null = null;

function loadKnowledgeManifest(): KnowledgeManifest {
  if (cachedKnowledgeManifest) {
    return cachedKnowledgeManifest;
  }

  const manifestPath = resolveKnowledgeManifestPath();
  if (!existsSync(manifestPath)) {
    throw new Error(`Knowledge manifest not found at ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as KnowledgeManifest;
  const seenArticleIds = new Set<number>();
  const seenFiles = new Set<string>();

  for (const entry of manifest.articles) {
    if (seenArticleIds.has(entry.articleId)) {
      throw new Error(`Duplicate articleId ${entry.articleId} in knowledge manifest`);
    }
    seenArticleIds.add(entry.articleId);

    if (seenFiles.has(entry.markdownFilename.toLowerCase())) {
      throw new Error(`Duplicate markdown filename ${entry.markdownFilename} in knowledge manifest`);
    }
    seenFiles.add(entry.markdownFilename.toLowerCase());
  }

  cachedKnowledgeManifest = Object.freeze({
    version: manifest.version,
    articles: Object.freeze([...manifest.articles].sort((left, right) => left.articleId - right.articleId)),
  });

  return cachedKnowledgeManifest;
}

function resolveKnowledgeArticleFilePath(articleId: string): string {
  const normalizedArticleId = normalizeArticleId(articleId);
  const parsedArticleNumber = Number.parseInt(normalizedArticleId.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(parsedArticleNumber)) {
    throw new Error(`Invalid article id "${articleId}"`);
  }

  const manifest = loadKnowledgeManifest();
  const articleEntry = manifest.articles.find((entry) => entry.articleId === parsedArticleNumber);
  if (!articleEntry) {
    throw new Error(`Article ${normalizedArticleId} not found in knowledge manifest`);
  }

  return join(resolveKnowledgeRoot(), articleEntry.markdownFilename);
}

function resolveLegacyAcademyRoot(): string {
  return ensureReviewerAcademyRegistry().rootDir;
}

function resolveUniversalProtocolFilePath(): string {
  return join(resolveLegacyAcademyRoot(), "Universal", "11_Universal_Review_Protocol.md");
}

function readMarkdownFile(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`Reviewer Academy article markdown not found at ${filePath}`);
  }

  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
}

export function loadReviewerAcademyMarkdownDocument(articleId: string): ReviewerAcademyMarkdownDocument {
  const normalizedArticleId = normalizeArticleId(articleId);
  const filePath = resolveKnowledgeArticleFilePath(normalizedArticleId);
  const content = readMarkdownFile(filePath);
  const headingMatch = content.match(/^#\s+(.+)$/m);

  return Object.freeze({
    articleId: normalizedArticleId,
    filePath,
    title: (headingMatch?.[1] ?? normalizedArticleId).trim(),
    content,
    characterCount: content.length,
  });
}

export function loadReviewerAcademyMarkdownDocuments(articleIds: readonly string[]): readonly ReviewerAcademyMarkdownDocument[] {
  const uniqueArticleIds = [...new Set(articleIds.map((articleId) => normalizeArticleId(articleId)).filter((articleId) => articleId.length > 0))].sort(compareArticleIds);
  return Object.freeze(uniqueArticleIds.map((articleId) => loadReviewerAcademyMarkdownDocument(articleId)));
}

export function loadUniversalReviewProtocolMarkdown(): ReviewerAcademyMarkdownDocument {
  const filePath = resolveUniversalProtocolFilePath();
  const content = readMarkdownFile(filePath);
  return Object.freeze({
    articleId: "universal_11",
    filePath,
    title: "Universal Review Protocol",
    content,
    characterCount: content.length,
  });
}

export function buildReviewerAcademyKnowledgePrompt(articleIds: readonly string[]): ReviewerAcademyKnowledgePrompt {
  const universalProtocol = loadUniversalReviewProtocolMarkdown();
  const articleDocuments = loadReviewerAcademyMarkdownDocuments(articleIds);
  const filePaths = Object.freeze([universalProtocol.filePath, ...articleDocuments.map((document) => document.filePath)]);
  const characterCount = universalProtocol.characterCount + articleDocuments.reduce((total, document) => total + document.characterCount, 0);
  const section = [
    "## Reviewer Academy Knowledge",
    `### ${universalProtocol.title}\n${universalProtocol.content}`,
    articleDocuments.length > 0
      ? [
          "### Selected Article Knowledge",
          ...articleDocuments.map((document) => `#### ${document.articleId} — ${document.title}\n${document.content}`),
        ].join("\n\n")
      : "### Selected Article Knowledge\n- (none)",
  ].join("\n\n");

  return Object.freeze({
    universalProtocol,
    articleDocuments,
    filePaths,
    characterCount,
    section,
  });
}
