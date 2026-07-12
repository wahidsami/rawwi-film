function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }

  if (value != null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sortedKeys = Object.keys(input).sort((a, b) => a.localeCompare(b, "en"));
    const out: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      out[key] = canonicalize(input[key]);
    }
    return out;
  }

  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
