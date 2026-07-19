import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../logger.js";
import type {
  KnowledgeDocument,
  KnowledgePrimaryEvidence,
  KnowledgeRegistry,
  KnowledgeReviewType,
} from "./knowledgeRegistryTypes.js";

type FrontMatter = Readonly<Record<string, string>>;

const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_ROOT_CANDIDATES = Object.freeze([
  join(MODULE_DIRECTORY, "..", "..", "..", "knowledge"),
  join(MODULE_DIRECTORY, "..", "..", "..", "..", "..", "knowledge"),
]);

let cachedRegistry: KnowledgeRegistry | null = null;

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeSlug(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function countCharacters(value: string): number {
  return value.length;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(countCharacters(value) / 4));
}

function computeFingerprint(entries: readonly { filePath: string; size: number; mtimeMs: number }[]): string {
  return createHash("sha256")
    .update(JSON.stringify(entries))
    .digest("hex");
}

function findKnowledgeRootCandidate(): string {
  for (const candidate of KNOWLEDGE_ROOT_CANDIDATES) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Knowledge root not found. Checked: ${KNOWLEDGE_ROOT_CANDIDATES.join(", ")}`);
}

function collectMarkdownFiles(directoryPath: string): readonly string[] {
  if (!isDirectory(directoryPath)) return Object.freeze([]);

  const files: string[] = [];
  const stack: string[] = [directoryPath];

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
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(fullPath);
      }
    }
  }

  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function parseFrontMatterBlock(text: string): { frontMatter: FrontMatter; body: string } {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontMatter: Object.freeze({}), body: normalizedText };
  }

  const frontMatterLines: string[] = [];
  let index = 1;
  while (index < lines.length && lines[index].trim() !== "---") {
    frontMatterLines.push(lines[index] ?? "");
    index += 1;
  }

  if (index >= lines.length) {
    return { frontMatter: Object.freeze({}), body: normalizedText };
  }

  const frontMatter: Record<string, string> = {};
  for (const rawLine of frontMatterLines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;

    const key = normalizeSlug(line.slice(0, colonIndex));
    const value = line.slice(colonIndex + 1).trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    if (key.length > 0) {
      frontMatter[key] = value;
    }
  }

  const body = lines.slice(index + 1).join("\n");
  return { frontMatter: Object.freeze(frontMatter), body };
}

function getFrontMatterValue(frontMatter: FrontMatter, ...candidates: readonly string[]): string | null {
  const normalizedCandidates = candidates.map((candidate) => normalizeSlug(candidate));
  for (const [key, value] of Object.entries(frontMatter)) {
    if (normalizedCandidates.includes(key)) {
      return value;
    }
  }
  return null;
}

function extractHeadings(text: string): readonly string[] {
  const headings: string[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (match?.[1]) {
      headings.push(normalizeText(match[1]));
    }
  }
  return Object.freeze(headings);
}

function extractTitle(fileName: string, frontMatter: FrontMatter, body: string): string {
  const metaTitle = getFrontMatterValue(frontMatter, "title", "display_title", "name");
  if (metaTitle && metaTitle.trim().length > 0) {
    return normalizeText(metaTitle);
  }

  const headings = extractHeadings(body);
  const humanHeading = headings.find((heading) => !/^article\s*\d+$/i.test(heading) && !/^article$/i.test(heading));
  if (humanHeading) {
    return humanHeading;
  }

  const fallback = fileName.replace(/\.md$/i, "").replace(/^[Aa]rticle[_-]?\d+[_-]?/, "");
  return normalizeText(fallback.length > 0 ? fallback.replace(/[_-]+/g, " ") : fileName.replace(/\.md$/i, ""));
}

function extractArticleReference(fileName: string, frontMatter: FrontMatter): number | null {
  const metaValue = getFrontMatterValue(frontMatter, "article_reference", "article", "article_id");
  if (metaValue && /^\d+$/.test(metaValue)) {
    return Number(metaValue);
  }

  const match = fileName.match(/^(?:article[_-])?(\d{1,2})/i);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function extractKnowledgeDomain(fileName: string, frontMatter: FrontMatter): string {
  const explicit = getFrontMatterValue(frontMatter, "knowledge_domain", "domain");
  if (explicit && explicit.trim().length > 0) {
    return normalizeSlug(explicit);
  }

  const stem = fileName.replace(/\.md$/i, "");
  const match = stem.match(/^(?:article[_-])?\d{1,2}[_-]?(.*)$/i);
  const slug = match?.[1] ?? stem;
  const normalized = normalizeSlug(slug);
  return normalized.length > 0 ? normalized : normalizeSlug(stem);
}

function inferReviewType(fileName: string, title: string, body: string, frontMatter: FrontMatter): KnowledgeReviewType {
  const explicit = getFrontMatterValue(frontMatter, "review_type", "reviewType");
  const normalizedExplicit = normalizeSlug(explicit ?? "");
  if (normalizedExplicit === "reasoning") return "Reasoning";
  if (normalizedExplicit === "verification") return "Verification";
  if (normalizedExplicit === "hybrid") return "Hybrid";

  const corpus = normalizeSlug([fileName, title, body].join(" "));
  if (/(credibility|misinformation|rumor|rumors|verification|fact_check|factchecking|news_reporting)/i.test(corpus)) {
    return "Verification";
  }
  if (/(hybrid|mixed|dual_track)/i.test(corpus)) {
    return "Hybrid";
  }
  return "Reasoning";
}

function inferPrimaryEvidence(fileName: string, title: string, body: string, reviewType: KnowledgeReviewType, frontMatter: FrontMatter): KnowledgePrimaryEvidence {
  const explicit = getFrontMatterValue(frontMatter, "primary_evidence", "primaryEvidence");
  const normalizedExplicit = normalizeSlug(explicit ?? "");
  if (normalizedExplicit === "dialogue") return "Dialogue";
  if (normalizedExplicit === "scenedescription" || normalizedExplicit === "scene_description") return "SceneDescription";
  if (normalizedExplicit === "storycontext" || normalizedExplicit === "story_context") return "StoryContext";

  if (reviewType === "Verification") {
    return "StoryContext";
  }

  const corpus = normalizeSlug([fileName, title, body].join(" "));
  if (/(dialogue|conversation|spoken|speech|utterance|quote)/i.test(corpus)) {
    return "Dialogue";
  }
  if (/(story_context|storycontext|background|narrative|history|context|scene|scene_description)/i.test(corpus)) {
    return "SceneDescription";
  }
  return "SceneDescription";
}

function buildKnowledgeDocument(filePath: string, rootDir: string): KnowledgeDocument {
  const text = readFileSync(filePath, "utf8");
  const lastModifiedMs = Math.floor(statSync(filePath).mtimeMs);
  const relativePath = relative(rootDir, filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? relativePath;
  const { frontMatter, body } = parseFrontMatterBlock(text);
  const title = extractTitle(fileName, frontMatter, body);
  const reviewType = inferReviewType(fileName, title, body, frontMatter);
  const primaryEvidence = inferPrimaryEvidence(fileName, title, body, reviewType, frontMatter);
  const articleReference = extractArticleReference(fileName, frontMatter);
  const knowledgeDomain = extractKnowledgeDomain(fileName, frontMatter);

  return Object.freeze({
    metadata: Object.freeze({
      knowledgeDomain,
      reviewType,
      primaryEvidence,
      articleReference,
      fileName,
      sourcePath: relativePath.replace(/\\/g, "/"),
      title,
      metadataSource: Object.keys(frontMatter).length > 0 ? "frontmatter" : "inferred",
    }),
    content: text,
    characterCount: countCharacters(text),
    estimatedTokenCount: estimateTokens(text),
    lastModifiedMs,
  });
}

function buildDocumentsByDomain(documents: readonly KnowledgeDocument[]): Readonly<Record<string, readonly KnowledgeDocument[]>> {
  const record: Record<string, KnowledgeDocument[]> = {};
  for (const document of documents) {
    record[document.metadata.knowledgeDomain] ??= [];
    record[document.metadata.knowledgeDomain].push(document);
  }

  const result: Record<string, readonly KnowledgeDocument[]> = {};
  for (const [domain, domainDocuments] of Object.entries(record)) {
    result[domain] = Object.freeze(domainDocuments.sort((left, right) => left.metadata.fileName.localeCompare(right.metadata.fileName)));
  }

  return Object.freeze(result);
}

function buildFilesByDomain(documents: readonly KnowledgeDocument[]): Readonly<Record<string, readonly string[]>> {
  const record: Record<string, string[]> = {};
  for (const document of documents) {
    record[document.metadata.knowledgeDomain] ??= [];
    record[document.metadata.knowledgeDomain].push(document.metadata.sourcePath);
  }

  const result: Record<string, readonly string[]> = {};
  for (const [domain, sources] of Object.entries(record)) {
    result[domain] = Object.freeze(sources.sort((left, right) => left.localeCompare(right)));
  }

  return Object.freeze(result);
}

function loadKnowledgeRegistryFromRoot(rootDir: string): KnowledgeRegistry {
  const files = collectMarkdownFiles(rootDir);
  if (files.length === 0) {
    throw new Error(`Knowledge registry contains no markdown files under ${rootDir}`);
  }

  const documents = files.map((filePath) => buildKnowledgeDocument(filePath, rootDir));
  const fingerprint = computeFingerprint(files.map((filePath) => {
    const stats = statSync(filePath);
    return {
      filePath: relative(rootDir, filePath).replace(/\\/g, "/"),
      size: stats.size,
      mtimeMs: Math.floor(stats.mtimeMs),
    };
  }));

  const registry = Object.freeze({
    rootDir,
    loadedAt: new Date().toISOString(),
    fingerprint,
    documents: Object.freeze([...documents].sort((left, right) => left.metadata.sourcePath.localeCompare(right.metadata.sourcePath))),
    documentsByDomain: buildDocumentsByDomain(documents),
    filesByDomain: buildFilesByDomain(documents),
    fileCount: files.length,
    markdownCount: documents.length,
    knowledgeDomainCount: Object.keys(buildDocumentsByDomain(documents)).length,
    characterCount: documents.reduce((total, document) => total + document.characterCount, 0),
    estimatedTokenCount: documents.reduce((total, document) => total + document.estimatedTokenCount, 0),
  }) satisfies KnowledgeRegistry;

  return registry;
}

export function resolveKnowledgeRoot(): string {
  return findKnowledgeRootCandidate();
}

export function ensureKnowledgeRegistry(): KnowledgeRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const rootDir = resolveKnowledgeRoot();
  cachedRegistry = loadKnowledgeRegistryFromRoot(rootDir);
  logger.info("Knowledge registry loaded", {
    knowledgeRoot: cachedRegistry.rootDir,
    fileCount: cachedRegistry.fileCount,
    markdownCount: cachedRegistry.markdownCount,
    knowledgeDomainCount: cachedRegistry.knowledgeDomainCount,
    characterCount: cachedRegistry.characterCount,
    estimatedTokenCount: cachedRegistry.estimatedTokenCount,
  });
  return cachedRegistry;
}

export function reloadKnowledgeRegistry(): KnowledgeRegistry {
  cachedRegistry = null;
  return ensureKnowledgeRegistry();
}

export function getKnowledgeRegistry(): KnowledgeRegistry {
  return ensureKnowledgeRegistry();
}

export function findKnowledgeDocumentByArticleReference(articleReference: number, registry: KnowledgeRegistry = ensureKnowledgeRegistry()): KnowledgeDocument | null {
  if (!Number.isFinite(articleReference) || articleReference <= 0) {
    return null;
  }

  return registry.documents.find((document) => document.metadata.articleReference === articleReference) ?? null;
}

export function loadKnowledgeRegistryFromDirectory(rootDir: string): KnowledgeRegistry {
  return loadKnowledgeRegistryFromRoot(rootDir);
}
