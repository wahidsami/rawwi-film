import { createHash } from "node:crypto";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeGcamMapperText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeGcamMapperKey(value: string): string {
  return normalizeGcamMapperText(value).toLowerCase();
}

export function compareGcamMapperVersions(left: string, right: string): number {
  const parse = (value: string): readonly [number, number, number] => {
    const match = normalizeGcamMapperText(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return [0, 0, 0];
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const [leftMajor, leftMinor, leftPatch] = parse(left);
  const [rightMajor, rightMinor, rightPatch] = parse(right);
  return leftMajor - rightMajor || leftMinor - rightMinor || leftPatch - rightPatch;
}

export function canonicalizeGcamMapperValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeGcamMapperValue(entry));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      result[key] = canonicalizeGcamMapperValue(value[key]);
    }
    return result;
  }

  return value;
}

export function stableSerializeGcamMapperValue(value: unknown): string {
  return JSON.stringify(canonicalizeGcamMapperValue(value), null, 2);
}

export function hashGcamMapperValue(value: unknown): string {
  return createHash("sha256").update(stableSerializeGcamMapperValue(value), "utf8").digest("hex");
}

export function freezeGcamMapperValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeGcamMapperValue(entry))) as T;
  }

  if (isPlainObject(value)) {
    const frozen: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      frozen[key] = freezeGcamMapperValue(value[key]);
    }
    return Object.freeze(frozen) as T;
  }

  return value;
}
