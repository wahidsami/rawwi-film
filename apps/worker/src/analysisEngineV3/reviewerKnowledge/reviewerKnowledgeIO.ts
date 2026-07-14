/**
 * Compatibility layer for reviewer-knowledge documents.
 *
 * Why this file exists:
 * - Supports both current structured reviewer-knowledge documents and older legacy pack shapes.
 * - Preserves import/export compatibility for historical knowledge assets already in the repository.
 *
 * Active V3 reviewer pipeline participation:
 * - Active compatibility layer for knowledge loading, not a reasoning engine.
 *
 * Backward compatibility:
 * - Retained intentionally to keep legacy knowledge imports functioning.
 *
 * New functionality:
 * - Do not add new functionality here.
 *
 * Removal guidance:
 * - Safe to remove only after V3 production stabilization and after the full knowledge corpus has migrated to the current schema.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";
import { normalizeReviewerKnowledgePack } from "./reviewerKnowledgeNormalization.js";
import {
  ReviewerKnowledgePackBundleSchema,
  ReviewerKnowledgePackDocumentSchema,
  ReviewerKnowledgePackSchema,
  type ReviewerKnowledgePackBundle,
  type ReviewerKnowledgePackDocument,
  type ReviewerKnowledgePackDocumentInput,
} from "./reviewerKnowledgeSchemas.js";

export type ReviewerKnowledgeDocumentFormat = "json" | "yaml";

export type ReviewerKnowledgePackLoadResult = Readonly<{
  packs: readonly ReviewerKnowledgePack[];
  documents: readonly ReviewerKnowledgePackDocument[];
  sourceFormat: ReviewerKnowledgeDocumentFormat | "legacy";
}>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (isPlainObject(value)) {
    const canonical: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      canonical[key] = canonicalize(value[key]);
    }
    return canonical;
  }

  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value.length === 0) return "";
  if (value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return JSON.parse(value.replace(/'/g, '"'));
  }
  return value;
}

function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDouble) inSingle = !inSingle;
    else if (char === "\"" && !inSingle) inDouble = !inDouble;
    else if (char === "#" && !inSingle && !inDouble) return line.slice(0, index);
  }
  return line;
}

function parseYamlDocument(text: string): unknown {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => stripComment(line).replace(/\s+$/, ""));
  let index = 0;

  function skipBlankLines(): void {
    while (index < lines.length && lines[index].trim().length === 0) {
      index += 1;
    }
  }

  function indentation(line: string): number {
    return line.match(/^ */)?.[0].length ?? 0;
  }

  function parseBlock(expectedIndent: number): unknown {
    skipBlankLines();
    if (index >= lines.length) return null;

    const firstLine = lines[index];
    const firstIndent = indentation(firstLine);
    if (firstIndent < expectedIndent) return null;

    const trimmed = firstLine.slice(expectedIndent);
    if (trimmed.startsWith("-") && (trimmed.length === 1 || trimmed[1] === " ")) {
      const array: unknown[] = [];
      while (index < lines.length) {
        skipBlankLines();
        if (index >= lines.length) break;
        const line = lines[index];
        const lineIndent = indentation(line);
        if (lineIndent < expectedIndent) break;
        if (!line.slice(expectedIndent).startsWith("-")) break;

        let remainder = line.slice(expectedIndent + 1);
        if (remainder.startsWith(" ")) remainder = remainder.slice(1);
        index += 1;

        if (remainder.trim().length === 0) {
          array.push(parseBlock(expectedIndent + 2));
          continue;
        }

        const inlineObjectMatch = remainder.match(/^([^:]+):(.*)$/);
        if (inlineObjectMatch) {
          const obj: Record<string, unknown> = {};
          obj[inlineObjectMatch[1].trim()] = parseScalar(inlineObjectMatch[2]);
          const nested = parseBlock(expectedIndent + 2);
          if (isPlainObject(nested)) {
            Object.assign(obj, nested);
          } else if (nested !== null && nested !== undefined) {
            array.push(obj);
            array.push(nested);
            continue;
          }
          array.push(obj);
          continue;
        }

        array.push(parseScalar(remainder));
      }
      return array;
    }

    const object: Record<string, unknown> = {};
    while (index < lines.length) {
      skipBlankLines();
      if (index >= lines.length) break;
      const line = lines[index];
      const lineIndent = indentation(line);
      if (lineIndent < expectedIndent) break;
      if (lineIndent > expectedIndent) {
        throw new Error(`Invalid YAML indentation at line ${index + 1}`);
      }

      const content = line.slice(expectedIndent);
      if (content.startsWith("-")) {
        break;
      }

      const colonIndex = content.indexOf(":");
      if (colonIndex < 0) {
        throw new Error(`Invalid YAML line ${index + 1}: missing colon`);
      }

      const key = content.slice(0, colonIndex).trim();
      let remainder = content.slice(colonIndex + 1);
      index += 1;

      if (remainder.trim().length === 0) {
        object[key] = parseBlock(expectedIndent + 2);
        continue;
      }

      object[key] = parseScalar(remainder);
    }

    return object;
  }

  return parseBlock(0);
}

export function parseReviewerKnowledgeDocumentText(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("Reviewer knowledge document is empty");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return parseYamlDocument(trimmed);
  }
}

export function serializeReviewerKnowledgePackDocument(document: ReviewerKnowledgePackDocument, format: ReviewerKnowledgeDocumentFormat = "json"): string {
  void format;
  return stableSerialize(document);
}

export function serializeReviewerKnowledgePackBundle(document: ReviewerKnowledgePackBundle, format: ReviewerKnowledgeDocumentFormat = "json"): string {
  void format;
  return stableSerialize(document);
}

export function createReviewerKnowledgePackDocument(pack: ReviewerKnowledgePack, packVersion = "1.0.0"): ReviewerKnowledgePackDocument {
  return Object.freeze({
    schema_version: 1,
    pack_version: packVersion,
    format: "reviewer_knowledge_pack" as const,
    pack: normalizeReviewerKnowledgePack(pack),
  });
}

export function createReviewerKnowledgePackBundle(packs: readonly ReviewerKnowledgePack[], bundleVersion = "1.0.0", packVersion = "1.0.0"): ReviewerKnowledgePackBundle {
  return Object.freeze({
    schema_version: 1,
    bundle_version: bundleVersion,
    format: "reviewer_knowledge_bundle" as const,
    packs: [...packs.map((pack) => createReviewerKnowledgePackDocument(pack, packVersion))],
  });
}

export function importReviewerKnowledgeDocument(input: ReviewerKnowledgePackDocumentInput): readonly ReviewerKnowledgePack[] {
  const sortPacks = (packs: readonly ReviewerKnowledgePack[]): readonly ReviewerKnowledgePack[] =>
    Object.freeze([...packs].sort((left, right) => left.id.localeCompare(right.id)));

  if (Array.isArray((input as ReviewerKnowledgePackBundle).packs)) {
    const parsed = ReviewerKnowledgePackBundleSchema.parse(input as ReviewerKnowledgePackBundle);
    return sortPacks(parsed.packs.map((document) => normalizeReviewerKnowledgePack(document.pack)));
  }

  const bundle = ReviewerKnowledgePackBundleSchema.safeParse(input);
  if (bundle.success) {
    return sortPacks(bundle.data.packs.map((document) => normalizeReviewerKnowledgePack(document.pack)));
  }

  const document = ReviewerKnowledgePackDocumentSchema.safeParse(input);
  if (document.success) {
    return sortPacks([normalizeReviewerKnowledgePack(document.data.pack)]);
  }

  const pack = ReviewerKnowledgePackSchema.safeParse(input);
  if (pack.success) {
    return sortPacks([normalizeReviewerKnowledgePack(pack.data)]);
  }

  const message = [
    ...(bundle.success ? [] : bundle.error.issues.map((issue) => `bundle.${issue.path.join(".")}: ${issue.message}`)),
    ...(document.success ? [] : document.error.issues.map((issue) => `document.${issue.path.join(".")}: ${issue.message}`)),
    ...(pack.success ? [] : pack.error.issues.map((issue) => `pack.${issue.path.join(".")}: ${issue.message}`)),
  ].join("; ");

  throw new Error(`Invalid reviewer knowledge document: ${message}`);
}

export async function loadReviewerKnowledgeDocumentFromFile(filePath: string): Promise<readonly ReviewerKnowledgePack[]> {
  const text = await readFile(filePath, "utf8");
  return importReviewerKnowledgeDocument(parseReviewerKnowledgeDocumentText(text) as ReviewerKnowledgePackDocumentInput);
}

export async function loadReviewerKnowledgeDocumentsFromDirectory(directoryPath: string): Promise<ReviewerKnowledgePackLoadResult> {
  const entries = (await readdir(directoryPath)).filter((entry) => [".json", ".yaml", ".yml"].includes(extname(entry).toLowerCase())).sort((left, right) => left.localeCompare(right));
  const documents: ReviewerKnowledgePackDocument[] = [];
  const packs: ReviewerKnowledgePack[] = [];
  let sourceFormat: ReviewerKnowledgeDocumentFormat | "legacy" = "legacy";

  for (const entry of entries) {
    const filePath = join(directoryPath, entry);
    const parsed = parseReviewerKnowledgeDocumentText(await readFile(filePath, "utf8"));
    sourceFormat = extname(entry).toLowerCase() === ".json" ? "json" : "yaml";

    const imported = importReviewerKnowledgeDocument(parsed as ReviewerKnowledgePackDocumentInput);
    packs.push(...imported);

    const bundle = ReviewerKnowledgePackBundleSchema.safeParse(parsed);
    if (bundle.success) {
      documents.push(...bundle.data.packs);
      continue;
    }

    const document = ReviewerKnowledgePackDocumentSchema.safeParse(parsed);
    if (document.success) {
      documents.push(document.data);
      continue;
    }

    const legacy = ReviewerKnowledgePackSchema.safeParse(parsed);
    if (legacy.success) {
      documents.push(createReviewerKnowledgePackDocument(legacy.data));
    }
  }

  return Object.freeze({
    packs: [...packs],
    documents: [...documents],
    sourceFormat,
  });
}

export async function saveReviewerKnowledgeDocumentToFile(
  filePath: string,
  document: ReviewerKnowledgePackDocument | ReviewerKnowledgePackBundle,
  format: ReviewerKnowledgeDocumentFormat = "json",
): Promise<void> {
  const serialized = "packs" in document ? serializeReviewerKnowledgePackBundle(document, format) : serializeReviewerKnowledgePackDocument(document, format);
  await writeFile(filePath, serialized, "utf8");
}

export function normalizeReviewerKnowledgePackDocumentInput(input: ReviewerKnowledgePackDocumentInput): readonly ReviewerKnowledgePack[] {
  return importReviewerKnowledgeDocument(input);
}
