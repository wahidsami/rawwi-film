export type KnowledgeAcquisitionVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export function normalizeKnowledgeAcquisitionText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function normalizeKnowledgeAcquisitionVersion(input: string | KnowledgeAcquisitionVersion): string {
  if (typeof input === "string") {
    const match = input.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!match) return "0.0.0";
    return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
  }
  return `${input.major}.${input.minor}.${input.patch}`;
}

export function parseKnowledgeAcquisitionVersion(input: string): KnowledgeAcquisitionVersion | null {
  const match = normalizeKnowledgeAcquisitionText(input).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return Object.freeze({
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  });
}

export function compareKnowledgeAcquisitionVersions(left: string, right: string): number {
  const a = parseKnowledgeAcquisitionVersion(left);
  const b = parseKnowledgeAcquisitionVersion(right);
  if (!a || !b) return normalizeKnowledgeAcquisitionText(left).localeCompare(normalizeKnowledgeAcquisitionText(right));
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

export function isLikelyIsoDate(value: string): boolean {
  const text = normalizeKnowledgeAcquisitionText(value);
  if (text.length === 0) return false;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp);
}
