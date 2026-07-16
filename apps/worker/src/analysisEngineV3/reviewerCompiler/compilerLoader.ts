import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../logger.js";
import type { V3PromptJsonValue } from "../builder/builderTypes.js";
import type {
  ReviewerAcademyArticle,
  ReviewerAcademyAtom,
  ReviewerAcademyFrontMatterValue,
  ReviewerAcademyManual,
  ReviewerAcademyManualSection,
  ReviewerAcademyRegistry,
  ReviewerAcademyRelationshipMap,
} from "./compilerTypes.js";

type ParsedYamlValue =
  | string
  | number
  | boolean
  | null
  | readonly ParsedYamlValue[]
  | ParsedYamlObject;

interface ParsedYamlObject extends Readonly<Record<string, ParsedYamlValue>> {}

type LoadedMarkdownDocument = Readonly<{
  document: ReviewerAcademyManual;
  isManual: boolean;
}>;

const COMPILER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ACADEMY_DIRECTORY_CANDIDATES = Object.freeze([
  join(COMPILER_DIRECTORY, "..", "..", "reviewerAcademy"),
  join(process.cwd(), "apps", "worker", "src", "reviewerAcademy"),
  join(process.cwd(), "src", "reviewerAcademy"),
  join(process.cwd(), "reviewerAcademy"),
]);

const MARKDOWN_EXTENSIONS = new Set([".md"]);
const METADATA_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);
let cachedRegistry: ReviewerAcademyRegistry | null = null;

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function normalizeFolderName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePathSeparators(value: string): string {
  return value.replace(/\\/g, "/");
}

function relativeFromRoot(rootDir: string, filePath: string): string {
  return normalizePathSeparators(relative(rootDir, filePath));
}

function resolveAcademyRoot(): string {
  for (const candidate of ACADEMY_DIRECTORY_CANDIDATES) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Reviewer Academy root not found. Checked: ${ACADEMY_DIRECTORY_CANDIDATES.join(", ")}`);
}

function collectFiles(directoryPath: string): readonly string[] {
  if (!isDirectory(directoryPath)) return [];

  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function parseScalarValue(value: string): ParsedYamlValue {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (trimmed === "[]") return Object.freeze([]);
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (inner.length === 0) return Object.freeze([]);
    return Object.freeze(
      inner
        .split(",")
        .map((item) => parseScalarValue(item.trim())),
    );
  }

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function countIndent(line: string): number {
  return (line.match(/^ */)?.[0].length ?? 0);
}

function parseYamlDocument(input: string): ParsedYamlValue {
  const lines = input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"));

  let index = 0;

  function peekNextIndent(): number {
    const nextLine = lines[index];
    return nextLine ? countIndent(nextLine) : -1;
  }

  function parseBlock(expectedIndent: number): ParsedYamlValue {
    if (index >= lines.length) return Object.freeze({});
    const line = lines[index];
    const currentIndent = countIndent(line);
    if (currentIndent < expectedIndent) return Object.freeze({});
    if (line.slice(currentIndent).startsWith("- ")) {
      return parseSequence(expectedIndent);
    }
    return parseMapping(expectedIndent);
  }

  function parseSequence(expectedIndent: number): readonly ParsedYamlValue[] {
    const values: ParsedYamlValue[] = [];
    while (index < lines.length) {
      const line = lines[index];
      const currentIndent = countIndent(line);
      if (currentIndent < expectedIndent) break;
      const trimmed = line.slice(currentIndent);
      if (!trimmed.startsWith("- ")) break;
      const itemText = trimmed.slice(2).trim();
      index += 1;
      if (itemText.length === 0) {
        const nestedIndent = peekNextIndent();
        if (nestedIndent <= currentIndent) {
          values.push(null);
          continue;
        }
        values.push(parseBlock(nestedIndent));
        continue;
      }
      values.push(parseScalarValue(itemText));
    }
    return Object.freeze(values);
  }

  function parseMapping(expectedIndent: number): Readonly<Record<string, ParsedYamlValue>> {
    const values: Record<string, ParsedYamlValue> = {};
    while (index < lines.length) {
      const line = lines[index];
      const currentIndent = countIndent(line);
      if (currentIndent < expectedIndent) break;
      if (currentIndent > expectedIndent) break;
      const trimmed = line.slice(currentIndent);
      if (trimmed.startsWith("- ")) break;
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex < 0) {
        index += 1;
        continue;
      }
      const key = trimmed.slice(0, colonIndex).trim();
      let valueText = trimmed.slice(colonIndex + 1).trim();
      index += 1;

      if (valueText.length === 0) {
        const nextIndent = peekNextIndent();
        if (nextIndent <= expectedIndent) {
          values[key] = null;
          continue;
        }
        values[key] = parseBlock(nextIndent);
        continue;
      }

      values[key] = parseScalarValue(valueText);
    }
    return Object.freeze(values);
  }

  return parseBlock(0);
}

function parseFrontMatter(input: string): { frontMatter: Readonly<Record<string, ReviewerAcademyFrontMatterValue>>; body: string } {
  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontMatter: Object.freeze({}), body: input };
  }

  const frontMatterLines: string[] = [];
  let index = 1;
  while (index < lines.length && lines[index].trim() !== "---") {
    frontMatterLines.push(lines[index]);
    index += 1;
  }

  if (index >= lines.length) {
    return { frontMatter: Object.freeze({}), body: input };
  }

  const frontMatter: Record<string, ReviewerAcademyFrontMatterValue> = {};
  let currentKey: string | null = null;
  const toFrontMatterValue = (value: ParsedYamlValue): ReviewerAcademyFrontMatterValue => {
    if (Array.isArray(value)) {
      return Object.freeze(value.map((item) => String(item)));
    }
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    return String(value);
  };

  for (const rawLine of frontMatterLines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentKey) {
      const currentValue = frontMatter[currentKey];
      const nextValue = String(parseScalarValue(listMatch[1].trim() as string));
      if (Array.isArray(currentValue)) {
        frontMatter[currentKey] = Object.freeze([...currentValue, nextValue]);
      } else if (currentValue === null || currentValue === undefined) {
        frontMatter[currentKey] = Object.freeze([nextValue]);
      } else {
        frontMatter[currentKey] = Object.freeze([String(currentValue), nextValue]);
      }
      continue;
    }

    const colonIndex = line.indexOf(":");
    if (colonIndex < 0) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    currentKey = key;

    if (value.length === 0) {
      frontMatter[key] = null;
      continue;
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      frontMatter[key] = toFrontMatterValue(parseScalarValue(value));
      continue;
    }

    frontMatter[key] = toFrontMatterValue(parseScalarValue(value));
  }

  const body = lines.slice(index + 1).join("\n").trimStart();
  return {
    frontMatter: Object.freeze(frontMatter),
    body,
  };
}

function normalizeTextBlock(value: string): string {
  return value.normalize("NFC").replace(/\s+\n/g, "\n").trim();
}

function extractTitle(content: string, fallbackTitle: string): string {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  return (headingMatch?.[1] ?? fallbackTitle).normalize("NFC").replace(/\s+/g, " ").trim();
}

function extractSections(content: string): readonly ReviewerAcademyManualSection[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const sections: ReviewerAcademyManualSection[] = [];
  let currentHeading = "Document";
  let currentLevel = 1;
  let buffer: string[] = [];

  const flush = (): void => {
    const sectionContent = normalizeTextBlock(buffer.join("\n"));
    if (sectionContent.length > 0) {
      sections.push(Object.freeze({
        heading: currentHeading,
        level: currentLevel,
        content: sectionContent,
      }));
    }
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentLevel = headingMatch[1].length;
      currentHeading = headingMatch[2].trim();
      continue;
    }

    buffer.push(line);
  }

  flush();
  return Object.freeze(sections);
}

function dedupeSections(sections: readonly ReviewerAcademyManualSection[]): readonly ReviewerAcademyManualSection[] {
  const seen = new Set<string>();
  const deduped: ReviewerAcademyManualSection[] = [];
  for (const section of sections) {
    const heading = section.heading.normalize("NFC").replace(/\s+/g, " ").trim();
    const content = section.content.normalize("NFC").replace(/\s+/g, " ").trim();
    const key = `${heading}\n${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(Object.freeze({
      heading,
      level: section.level,
      content: section.content.trim(),
    }));
  }
  return Object.freeze(deduped);
}

function classifyManualFolder(relativePath: string): string | null {
  const segments = relativePath.split("/");
  const topLevel = segments[0] ?? "";
  if (topLevel === "Universal") {
    return "universal";
  }
  if (topLevel === "Reviewers" && segments.length >= 3) {
    return normalizeFolderName(segments[1] ?? "");
  }
  return null;
}

function loadMarkdownDocument(filePath: string, rootDir: string): LoadedMarkdownDocument {
  const rawContent = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const { frontMatter, body } = parseFrontMatter(rawContent);
  const content = normalizeTextBlock(body.trim().length > 0 ? body.trim() : rawContent.trim());
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const fallbackTitle = fileName.replace(/\.md$/i, "").replace(/[_-]+/g, " ").trim();
  const title = extractTitle(content, fallbackTitle);
  const sections = dedupeSections(extractSections(content));
  const stats = statSync(filePath);
  const relativePath = relativeFromRoot(rootDir, filePath);
  const folder = classifyManualFolder(relativePath) ?? normalizeFolderName(relativePath.split("/")[0] ?? "reference");
  const document = Object.freeze({
    folder,
    fileName,
    relativePath,
    title,
    frontMatter,
    sections,
    content,
    characterCount: content.length,
    estimatedTokenCount: Math.max(1, Math.ceil(content.length / 4)),
    lastModifiedMs: Math.floor(stats.mtimeMs),
  });

  return Object.freeze({
    document,
    isManual: classifyManualFolder(relativePath) !== null,
  });
}

function loadYamlDocument(filePath: string): ParsedYamlValue {
  return parseYamlDocument(readFileSync(filePath, "utf8"));
}

function toStringArray(value: ParsedYamlValue | undefined | null): readonly string[] {
  if (value === null || value === undefined) return Object.freeze([]);
  if (!Array.isArray(value)) return Object.freeze([String(value)]);
  return Object.freeze(value.map((item) => String(item)));
}

function toStringValue(value: ParsedYamlValue | undefined | null): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toNumberValue(value: ParsedYamlValue | undefined | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBooleanValue(value: ParsedYamlValue | undefined | null): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function toRecordValue(value: ParsedYamlValue | undefined | null): Readonly<Record<string, V3PromptJsonValue>> | null {
  if (value === null || value === undefined || Array.isArray(value) || typeof value !== "object") return null;
  return value as Readonly<Record<string, V3PromptJsonValue>>;
}

function parseArticlesIndex(rootDir: string): Readonly<Record<string, ReviewerAcademyArticle>> {
  const filePath = join(rootDir, "Articles", "index.yaml");
  if (!existsSync(filePath)) {
    throw new Error(`Reviewer Academy validation failed: missing Articles/index.yaml at ${filePath}`);
  }

  const parsed = loadYamlDocument(filePath);
  const articlesRoot = toRecordValue((parsed as Record<string, ParsedYamlValue>).articles ?? null);
  if (!articlesRoot) {
    throw new Error("Reviewer Academy validation failed: Articles/index.yaml does not contain an articles map");
  }

  const articles: Record<string, ReviewerAcademyArticle> = {};
  for (const [articleId, rawArticle] of Object.entries(articlesRoot)) {
    const articleRecord = toRecordValue(rawArticle);
    if (!articleRecord) {
      throw new Error(`Reviewer Academy validation failed: article '${articleId}' is not a map`);
    }

    articles[articleId] = Object.freeze({
      articleId,
      reviewer: toStringValue(articleRecord.reviewer),
      title: toStringValue(articleRecord.title),
      protectedInterest: toStringValue(articleRecord.protected_interest ?? null),
      purpose: toStringValue(articleRecord.purpose ?? null),
      neighboringArticles: toStringArray(articleRecord.neighboring_articles ?? null),
      atoms: toStringArray(articleRecord.atoms ?? null),
      inherits: toStringArray(articleRecord.inherits ?? null),
      priority: toNumberValue(articleRecord.priority ?? null),
      runtime: toBooleanValue(articleRecord.runtime ?? null),
      retrieval: toRecordValue(articleRecord.retrieval ?? null),
      status: articleRecord.status === null || articleRecord.status === undefined ? null : String(articleRecord.status),
      sourcePath: `Articles/index.yaml#${articleId}`,
    });
  }

  return Object.freeze(articles);
}

function parseAtomsIndex(rootDir: string): Readonly<Record<string, ReviewerAcademyAtom>> {
  const filePath = join(rootDir, "Atoms", "index.yaml");
  if (!existsSync(filePath)) {
    throw new Error(`Reviewer Academy validation failed: missing Atoms/index.yaml at ${filePath}`);
  }

  const parsed = loadYamlDocument(filePath);
  const atomsRoot = toRecordValue((parsed as Record<string, ParsedYamlValue>).atoms ?? null);
  if (!atomsRoot) {
    throw new Error("Reviewer Academy validation failed: Atoms/index.yaml does not contain an atoms map");
  }

  const atoms: Record<string, ReviewerAcademyAtom> = {};
  for (const [atomId, rawAtom] of Object.entries(atomsRoot)) {
    const atomRecord = toRecordValue(rawAtom);
    if (!atomRecord) {
      throw new Error(`Reviewer Academy validation failed: atom '${atomId}' is not a map`);
    }

    atoms[atomId] = Object.freeze({
      atomId,
      articleId: toStringValue(atomRecord.article ?? null),
      reviewer: toStringValue(atomRecord.reviewer ?? null),
      title: toStringValue(atomRecord.title ?? null),
      protectedInterest: toStringValue(atomRecord.protected_interest ?? null),
      inherits: toStringArray(atomRecord.inherits ?? null),
      priority: toNumberValue(atomRecord.priority ?? null),
      runtime: toBooleanValue(atomRecord.runtime ?? null),
      retrieval: toRecordValue(atomRecord.retrieval ?? null),
      status: atomRecord.status === null || atomRecord.status === undefined ? null : String(atomRecord.status),
      sourcePath: `Atoms/index.yaml#${atomId}`,
    });
  }

  return Object.freeze(atoms);
}

function parseRelationshipMap(rootDir: string): ReviewerAcademyRelationshipMap {
  const filePath = join(rootDir, "Relationships", "relationshipMap.yaml");
  if (!existsSync(filePath)) {
    throw new Error(`Reviewer Academy validation failed: missing Relationships/relationshipMap.yaml at ${filePath}`);
  }

  const parsed = loadYamlDocument(filePath);
  const reviewersRoot = toRecordValue((parsed as Record<string, ParsedYamlValue>).reviewers ?? null);
  if (!reviewersRoot) {
    throw new Error("Reviewer Academy validation failed: relationshipMap.yaml does not contain a reviewers map");
  }

  const reviewers: Record<string, { articles: Record<string, { atoms: readonly string[] }> }> = {};
  for (const [reviewer, rawReviewer] of Object.entries(reviewersRoot)) {
    const reviewerRecord = toRecordValue(rawReviewer);
    if (!reviewerRecord) {
      throw new Error(`Reviewer Academy validation failed: reviewer '${reviewer}' is not a map`);
    }
    const articlesRoot = toRecordValue(reviewerRecord.articles ?? null) ?? {};
    const articles: Record<string, { atoms: readonly string[] }> = {};
    for (const [articleId, rawArticle] of Object.entries(articlesRoot)) {
      const articleRecord = toRecordValue(rawArticle);
      if (!articleRecord) {
        throw new Error(`Reviewer Academy validation failed: reviewer '${reviewer}' article '${articleId}' is not a map`);
      }
      articles[articleId] = Object.freeze({
        atoms: toStringArray(articleRecord.atoms ?? null),
      });
    }
    reviewers[reviewer] = Object.freeze({
      articles: Object.freeze(articles),
    });
  }

  return Object.freeze({
    reviewers: Object.freeze(reviewers),
  });
}

function buildArticlesByReviewer(articles: Readonly<Record<string, ReviewerAcademyArticle>>): Readonly<Record<string, readonly ReviewerAcademyArticle[]>> {
  const grouped: Record<string, ReviewerAcademyArticle[]> = {};
  for (const article of Object.values(articles)) {
    const reviewerKey = normalizeFolderName(article.reviewer);
    grouped[reviewerKey] ??= [];
    grouped[reviewerKey].push(article);
  }

  const result: Record<string, readonly ReviewerAcademyArticle[]> = {};
  for (const [reviewer, reviewerArticles] of Object.entries(grouped)) {
    result[reviewer] = Object.freeze(reviewerArticles.sort((left, right) => left.articleId.localeCompare(right.articleId)));
  }
  return Object.freeze(result);
}

function buildAtomsByArticle(atoms: Readonly<Record<string, ReviewerAcademyAtom>>): Readonly<Record<string, readonly ReviewerAcademyAtom[]>> {
  const grouped: Record<string, ReviewerAcademyAtom[]> = {};
  for (const atom of Object.values(atoms)) {
    grouped[atom.articleId] ??= [];
    grouped[atom.articleId].push(atom);
  }

  const result: Record<string, readonly ReviewerAcademyAtom[]> = {};
  for (const [articleId, articleAtoms] of Object.entries(grouped)) {
    result[articleId] = Object.freeze(articleAtoms.sort((left, right) => left.atomId.localeCompare(right.atomId)));
  }
  return Object.freeze(result);
}

function loadMarkdownDocuments(filePaths: readonly string[], rootDir: string): readonly LoadedMarkdownDocument[] {
  return Object.freeze(filePaths.map((filePath) => loadMarkdownDocument(filePath, rootDir)));
}

function computeFingerprint(filePaths: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(
      filePaths.map((filePath) => {
        const stats = statSync(filePath);
        return {
          path: normalizePathSeparators(filePath),
          size: stats.size,
          mtimeMs: Math.floor(stats.mtimeMs),
        };
      }),
    ), "utf8")
    .digest("hex");
}

function validateRegistry(registry: ReviewerAcademyRegistry): void {
  if (registry.universalManuals.length === 0) {
    throw new Error("Reviewer Academy validation failed: Universal manuals are missing");
  }

  if (registry.reviewerFolders.length === 0) {
    throw new Error("Reviewer Academy validation failed: no reviewer folders were loaded");
  }

  if (Object.keys(registry.articlesById).length === 0) {
    throw new Error("Reviewer Academy validation failed: no article metadata was loaded");
  }

  if (Object.keys(registry.atomsById).length === 0) {
    throw new Error("Reviewer Academy validation failed: no atom metadata was loaded");
  }

  const manualFolders = new Set(Object.keys(registry.manualsByFolder));
  const referencedArticles = new Set<string>();
  const referencedAtoms = new Set<string>();
  const orphanArticles: string[] = [];
  const orphanAtoms: string[] = [];

  for (const [reviewerName, reviewerGroup] of Object.entries(registry.relationshipMap.reviewers)) {
    const normalizedReviewerName = normalizeFolderName(reviewerName);
    if (!manualFolders.has(normalizedReviewerName) && normalizedReviewerName !== "universal") {
      logger.warn("Reviewer Academy relationship map references a reviewer without manuals", {
        reviewer: reviewerName,
      });
    }

    for (const [articleId, articleEntry] of Object.entries(reviewerGroup.articles)) {
      const article = registry.articlesById[articleId];
      if (!article) {
        throw new Error(`Reviewer Academy validation failed: relationship map references missing article '${articleId}' for reviewer '${reviewerName}'`);
      }
      if (normalizeFolderName(article.reviewer) !== normalizedReviewerName) {
        throw new Error(`Reviewer Academy validation failed: article '${articleId}' is assigned to reviewer '${article.reviewer}' but relationship map assigns it to '${reviewerName}'`);
      }

      referencedArticles.add(articleId);
      const articleAtoms = new Set(article.atoms.map((atomId) => normalizeFolderName(atomId)));
      const relationAtomIds = new Set(articleEntry.atoms.map((atomId) => normalizeFolderName(atomId)));

      for (const atomId of articleEntry.atoms) {
        const atom = registry.atomsById[atomId];
        if (!atom) {
          throw new Error(`Reviewer Academy validation failed: relationship map references missing atom '${atomId}' for article '${articleId}'`);
        }
        if (atom.articleId !== articleId) {
          throw new Error(`Reviewer Academy validation failed: atom '${atomId}' belongs to article '${atom.articleId}' but relationship map assigns it to '${articleId}'`);
        }
        if (normalizeFolderName(atom.reviewer) !== normalizedReviewerName) {
          throw new Error(`Reviewer Academy validation failed: atom '${atomId}' belongs to reviewer '${atom.reviewer}' but relationship map assigns it to '${reviewerName}'`);
        }
        referencedAtoms.add(atomId);
      }

      for (const atomId of article.atoms) {
        if (!relationAtomIds.has(normalizeFolderName(atomId))) {
          throw new Error(`Reviewer Academy validation failed: article '${articleId}' lists atom '${atomId}' that is missing from relationship map`);
        }
        if (!registry.atomsById[atomId]) {
          throw new Error(`Reviewer Academy validation failed: article '${articleId}' references missing atom '${atomId}'`);
        }
        if (registry.atomsById[atomId]?.articleId !== articleId) {
          throw new Error(`Reviewer Academy validation failed: atom '${atomId}' does not point back to article '${articleId}'`);
        }
        articleAtoms.add(normalizeFolderName(atomId));
      }
    }
  }

  for (const article of Object.values(registry.articlesById)) {
    if (!referencedArticles.has(article.articleId)) {
      orphanArticles.push(article.articleId);
    }
  }

  for (const atom of Object.values(registry.atomsById)) {
    if (!referencedAtoms.has(atom.atomId)) {
      orphanAtoms.push(atom.atomId);
    }
  }

  if (orphanArticles.length > 0) {
    logger.warn("Reviewer Academy orphan articles detected", {
      articleIds: orphanArticles.slice(0, 20),
      orphanCount: orphanArticles.length,
    });
  }

  if (orphanAtoms.length > 0) {
    logger.warn("Reviewer Academy orphan atoms detected", {
      atomIds: orphanAtoms.slice(0, 20),
      orphanCount: orphanAtoms.length,
    });
  }
}

function loadReviewerAcademyRegistryFromRoot(rootDir: string): ReviewerAcademyRegistry {
  const allFiles = collectFiles(rootDir);
  if (allFiles.length === 0) {
    throw new Error(`Reviewer Academy contains no files under ${rootDir}`);
  }

  const markdownFiles = allFiles.filter((filePath) => {
    const lower = filePath.toLowerCase();
    return MARKDOWN_EXTENSIONS.has(lower.slice(lower.lastIndexOf(".")));
  });
  const metadataFiles = allFiles.filter((filePath) => {
    const lower = filePath.toLowerCase();
    const extension = lower.slice(lower.lastIndexOf("."));
    return METADATA_EXTENSIONS.has(extension);
  });
  const markdownDocuments = loadMarkdownDocuments(markdownFiles, rootDir);
  const manualDocuments = markdownDocuments
    .filter((entry) => entry.isManual)
    .map((entry) => entry.document);
  const referenceDocuments = markdownDocuments
    .filter((entry) => !entry.isManual)
    .map((entry) => entry.document);

  const manualsByFolderRecord: Record<string, ReviewerAcademyManual[]> = {};
  for (const manual of manualDocuments) {
    manualsByFolderRecord[normalizeFolderName(manual.folder)] ??= [];
    manualsByFolderRecord[normalizeFolderName(manual.folder)].push(manual);
  }

  const manualsByFolder: Record<string, readonly ReviewerAcademyManual[]> = {};
  for (const [folder, folderManuals] of Object.entries(manualsByFolderRecord)) {
    const deduped = Array.from(new Map(folderManuals.map((manual) => [manual.relativePath, manual])).values());
    manualsByFolder[folder] = Object.freeze(
      deduped.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    );
  }

  const universalManuals = Object.freeze([...(manualsByFolder.universal ?? [])]);
  const reviewerFolders = Object.freeze(
    Object.keys(manualsByFolder)
      .filter((folder) => folder !== "universal")
      .sort((left, right) => left.localeCompare(right)),
  );

  const articlesById = parseArticlesIndex(rootDir);
  const atomsById = parseAtomsIndex(rootDir);
  const relationshipMap = parseRelationshipMap(rootDir);
  const articlesByReviewer = buildArticlesByReviewer(articlesById);
  const atomsByArticle = buildAtomsByArticle(atomsById);

  const characterCount = manualDocuments.reduce((total, manual) => total + manual.characterCount, 0);
  const estimatedTokenCount = Math.max(1, Math.ceil(characterCount / 4));

  const registry = Object.freeze({
    rootDir,
    fingerprint: computeFingerprint(allFiles),
    loadedAt: new Date().toISOString(),
    manuals: Object.freeze([...manualDocuments].sort((left, right) => left.relativePath.localeCompare(right.relativePath))),
    manualsByFolder: Object.freeze(manualsByFolder),
    universalManuals,
    reviewerFolders,
    articlesById,
    atomsById,
    articlesByReviewer,
    atomsByArticle,
    relationshipMap,
    documents: Object.freeze([...markdownDocuments.map((entry) => entry.document)].sort((left, right) => left.relativePath.localeCompare(right.relativePath))),
    referenceDocuments: Object.freeze([...referenceDocuments].sort((left, right) => left.relativePath.localeCompare(right.relativePath))),
    fileCount: allFiles.length,
    markdownCount: markdownDocuments.length,
    metadataCount: metadataFiles.length,
    articleCount: Object.keys(articlesById).length,
    atomCount: Object.keys(atomsById).length,
    characterCount,
    estimatedTokenCount,
  }) satisfies ReviewerAcademyRegistry;

  validateRegistry(registry);
  return registry;
}

export function ensureReviewerAcademyRegistry(): ReviewerAcademyRegistry {
  if (cachedRegistry) {
    return cachedRegistry;
  }

  const rootDir = resolveAcademyRoot();
  cachedRegistry = loadReviewerAcademyRegistryFromRoot(rootDir);
  logger.info("Reviewer Academy registry loaded", {
    academyRoot: cachedRegistry.rootDir,
    fileCount: cachedRegistry.fileCount,
    markdownCount: cachedRegistry.markdownCount,
    metadataCount: cachedRegistry.metadataCount,
    reviewerFolders: cachedRegistry.reviewerFolders.length,
    articleCount: cachedRegistry.articleCount,
    atomCount: cachedRegistry.atomCount,
    characterCount: cachedRegistry.characterCount,
    estimatedTokenCount: cachedRegistry.estimatedTokenCount,
  });
  return cachedRegistry;
}

export function reloadReviewerAcademyRegistry(): ReviewerAcademyRegistry {
  cachedRegistry = null;
  return ensureReviewerAcademyRegistry();
}

export function getReviewerAcademyRegistry(): ReviewerAcademyRegistry {
  return ensureReviewerAcademyRegistry();
}
