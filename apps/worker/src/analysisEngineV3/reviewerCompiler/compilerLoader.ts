import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { logger } from "../../logger.js";
import type { ReviewerAcademyRegistry, ReviewerAcademyManual, ReviewerAcademyManualSection } from "./compilerTypes.js";

const COMPILER_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ACADEMY_DIRECTORY_CANDIDATES = Object.freeze([
  join(COMPILER_DIRECTORY, "..", "..", "reviewerAcademy"),
  join(process.cwd(), "apps", "worker", "src", "reviewerAcademy"),
  join(process.cwd(), "src", "reviewerAcademy"),
  join(process.cwd(), "reviewerAcademy"),
]);

const TOP_LEVEL_FOLDERS = Object.freeze(["Universal", "Reviewers"]);
let cachedRegistry: ReviewerAcademyRegistry | null = null;

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function normalizeFolderName(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function resolveAcademyRoot(): string {
  for (const candidate of ACADEMY_DIRECTORY_CANDIDATES) {
    if (isDirectory(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Reviewer Academy root not found. Checked: ${ACADEMY_DIRECTORY_CANDIDATES.join(", ")}`,
  );
}

function collectMarkdownFiles(directoryPath: string): readonly string[] {
  if (!isDirectory(directoryPath)) return [];

  const entries = readdirSync(directoryPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return Object.freeze(files.sort((left, right) => left.localeCompare(right)));
}

function parseFrontMatter(input: string): { frontMatter: Readonly<Record<string, string | number | boolean | readonly string[] | null>>; body: string } {
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

  const frontMatter: Record<string, string | number | boolean | readonly string[] | null> = {};
  let currentKey: string | null = null;
  for (const rawLine of frontMatterLines) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0 || line.trim().startsWith("#")) continue;

    const listMatch = line.match(/^\s*-\s+(.+)$/);
    if (listMatch && currentKey) {
      const currentValue = frontMatter[currentKey];
      const nextValue = listMatch[1].trim();
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

    if (value === "true" || value === "false") {
      frontMatter[key] = value === "true";
      continue;
    }

    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
      frontMatter[key] = Number(value);
      continue;
    }

    if ((value.startsWith("[") && value.endsWith("]"))) {
      try {
        const parsed = JSON.parse(value.replace(/'/g, "\""));
        frontMatter[key] = Array.isArray(parsed) ? Object.freeze(parsed.map((item) => String(item))) : String(parsed);
        continue;
      } catch {
        // fall through to string handling
      }
    }

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontMatter[key] = value;
  }

  const body = lines.slice(index + 1).join("\n").trimStart();
  return {
    frontMatter: Object.freeze(frontMatter),
    body,
  };
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
    const sectionContent = buffer.join("\n").trim();
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

function toRelativeFolder(rootDir: string, filePath: string): string {
  const relative = filePath.slice(rootDir.length + 1).replace(/\\/g, "/");
  const [topLevel, nextFolder] = relative.split("/", 3);
  if (topLevel === "Universal") {
    return "universal";
  }
  if (topLevel === "Reviewers" && nextFolder) {
    return normalizeFolderName(nextFolder);
  }
  return normalizeFolderName(topLevel ?? "unknown");
}

function loadManual(filePath: string, rootDir: string): ReviewerAcademyManual {
  const rawContent = readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const { frontMatter, body } = parseFrontMatter(rawContent);
  const content = body.trim().length > 0 ? body.trim() : rawContent.trim();
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const fallbackTitle = fileName.replace(/\.md$/i, "").replace(/[_-]+/g, " ").trim();
  const title = extractTitle(content, fallbackTitle);
  const sections = extractSections(content);
  const stats = statSync(filePath);
  const characterCount = content.length;
  return Object.freeze({
    folder: toRelativeFolder(rootDir, filePath),
    fileName,
    relativePath: filePath.slice(rootDir.length + 1).replace(/\\/g, "/"),
    title,
    frontMatter,
    sections,
    content,
    characterCount,
    estimatedTokenCount: Math.max(1, Math.ceil(characterCount / 4)),
    lastModifiedMs: Math.floor(stats.mtimeMs),
  });
}

function computeFingerprint(rootDir: string, filePaths: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify(
    filePaths.map((filePath) => {
      const stats = statSync(filePath);
      return {
        path: filePath.slice(rootDir.length + 1).replace(/\\/g, "/"),
        size: stats.size,
        mtimeMs: Math.floor(stats.mtimeMs),
      };
    }),
  ), "utf8").digest("hex");
}

function loadReviewerAcademyRegistryFromRoot(rootDir: string): ReviewerAcademyRegistry {
  const filePaths = TOP_LEVEL_FOLDERS.flatMap((folder) => collectMarkdownFiles(join(rootDir, folder)));
  if (filePaths.length === 0) {
    throw new Error(`Reviewer Academy contains no markdown manuals under ${rootDir}`);
  }

  const manuals = filePaths.map((filePath) => loadManual(filePath, rootDir));
  const manualsByFolderRecord: Record<string, ReviewerAcademyManual[]> = {};
  for (const manual of manuals) {
    const folder = normalizeFolderName(manual.folder);
    manualsByFolderRecord[folder] ??= [];
    manualsByFolderRecord[folder].push(manual);
  }

  const manualsByFolder: Record<string, readonly ReviewerAcademyManual[]> = {};
  for (const [folder, folderManuals] of Object.entries(manualsByFolderRecord)) {
    manualsByFolder[folder] = Object.freeze(folderManuals.sort((left, right) => left.relativePath.localeCompare(right.relativePath)));
  }

  const universalManuals = Object.freeze([...(manualsByFolder.universal ?? [])]);
  const reviewerFolders = Object.freeze(Object.keys(manualsByFolder)
    .filter((folder) => folder !== "universal")
    .sort((left, right) => left.localeCompare(right)));
  const characterCount = manuals.reduce((total, manual) => total + manual.characterCount, 0);
  const estimatedTokenCount = Math.max(1, Math.ceil(characterCount / 4));

  return Object.freeze({
    rootDir,
    fingerprint: computeFingerprint(rootDir, filePaths),
    loadedAt: new Date().toISOString(),
    manuals: Object.freeze([...manuals].sort((left, right) => left.relativePath.localeCompare(right.relativePath))),
    manualsByFolder: Object.freeze(manualsByFolder),
    universalManuals,
    reviewerFolders,
    fileCount: manuals.length,
    characterCount,
    estimatedTokenCount,
  });
}

function validateRegistry(registry: ReviewerAcademyRegistry): void {
  if (registry.universalManuals.length === 0) {
    throw new Error("Reviewer Academy validation failed: Universal manuals are missing");
  }

  if (registry.reviewerFolders.length === 0) {
    throw new Error("Reviewer Academy validation failed: no reviewer folders were loaded");
  }

  for (const folder of registry.reviewerFolders) {
    const manuals = registry.manualsByFolder[folder] ?? [];
    if (manuals.length === 0) {
      throw new Error(`Reviewer Academy validation failed: reviewer folder '${folder}' contains no manuals`);
    }
  }
}

export function ensureReviewerAcademyRegistry(): ReviewerAcademyRegistry {
  const rootDir = resolveAcademyRoot();
  const filePaths = TOP_LEVEL_FOLDERS.flatMap((folder) => collectMarkdownFiles(join(rootDir, folder)));
  if (filePaths.length === 0) {
    throw new Error(`Reviewer Academy validation failed: no markdown manuals found under ${rootDir}`);
  }

  const fingerprint = computeFingerprint(rootDir, filePaths);
  if (cachedRegistry && cachedRegistry.rootDir === rootDir && cachedRegistry.fingerprint === fingerprint) {
    return cachedRegistry;
  }

  const registry = loadReviewerAcademyRegistryFromRoot(rootDir);
  validateRegistry(registry);
  cachedRegistry = registry;
  logger.info("Reviewer Academy registry loaded", {
    academyRoot: rootDir,
    fileCount: registry.fileCount,
    reviewerFolders: registry.reviewerFolders.length,
    characterCount: registry.characterCount,
    estimatedTokenCount: registry.estimatedTokenCount,
  });
  return registry;
}

export function getReviewerAcademyRegistry(): ReviewerAcademyRegistry {
  return ensureReviewerAcademyRegistry();
}
