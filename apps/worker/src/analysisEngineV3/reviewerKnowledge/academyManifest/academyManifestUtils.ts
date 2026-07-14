import { createHash } from "node:crypto";

import type { AcademyManifestVersion } from "./academyManifestTypes.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

export function normalizeVersion(version: unknown): AcademyManifestVersion {
  if (isPlainObject(version)) {
    return Object.freeze({
      major: typeof version.major === "number" && Number.isFinite(version.major) ? version.major : 0,
      minor: typeof version.minor === "number" && Number.isFinite(version.minor) ? version.minor : 0,
      patch: typeof version.patch === "number" && Number.isFinite(version.patch) ? version.patch : 0,
    });
  }

  return Object.freeze({ major: 0, minor: 0, patch: 0 });
}

export function compareVersions(left: AcademyManifestVersion, right: AcademyManifestVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function academyKeyFromId(id: string): string {
  const normalized = normalizeId(id);
  const parts = normalized.split("_");
  return parts[parts.length - 1] ?? normalized;
}

export function lessonNumberFromText(value: string): number | null {
  const normalized = normalizeId(value);
  const match = normalized.match(/lesson[_-]?0*(\d{1,4})/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function padLessonNumber(value: number): string {
  return String(value).padStart(3, "0");
}

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
      result[key] = canonicalize(value[key]);
    }
    return result;
  }

  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalize(value), null, 2);
}

export function hashValue(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

export function asStringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").map(normalizeText).filter(Boolean) : [];
}
