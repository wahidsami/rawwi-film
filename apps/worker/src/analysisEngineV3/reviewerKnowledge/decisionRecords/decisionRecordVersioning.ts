import type { DecisionRecordVersion } from "./decisionRecordTypes.js";

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export function normalizeDecisionRecordVersion(version: unknown): string {
  if (typeof version !== "string") return "0.0.0";
  const match = version.trim().match(VERSION_PATTERN);
  if (!match) return "0.0.0";
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

export function parseDecisionRecordVersion(version: string): DecisionRecordVersion {
  const normalized = normalizeDecisionRecordVersion(version);
  const match = normalized.match(VERSION_PATTERN);
  return Object.freeze({
    major: Number(match?.[1] ?? 0),
    minor: Number(match?.[2] ?? 0),
    patch: Number(match?.[3] ?? 0),
  });
}

export function compareDecisionRecordVersions(left: string, right: string): number {
  const a = parseDecisionRecordVersion(left);
  const b = parseDecisionRecordVersion(right);
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function decisionRecordVersionToString(version: DecisionRecordVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}
