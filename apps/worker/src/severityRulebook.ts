/**
 * GCAM Severity Rulebook (v2): deterministic severity from factors.
 * AI outputs factors (1-4 each); backend computes severity and applies overrides.
 * This version is intentionally conservative so borderline findings do not
 * over-escalate into HIGH unless the content or risk profile clearly supports it.
 */

export type Severity = "low" | "medium" | "high" | "critical";

export type SeverityFactors = {
  intensity: number;
  context_impact: number;
  legal_sensitivity: number;
  audience_risk: number;
};

export const CANONICAL_ATOMS = [
  "INSULT",
  "VIOLENCE",
  "SEXUAL",
  "SUBSTANCES",
  "DISCRIMINATION",
  "CHILD_SAFETY",
  "WOMEN",
  "MISINFORMATION",
  "PUBLIC_ORDER",
  "EXTREMISM",
  "INTERNATIONAL",
  "ECONOMIC",
  "PRIVACY",
  "APPEARANCE",
] as const;

export type CanonicalAtom = (typeof CANONICAL_ATOMS)[number];

/** Default legal_sensitivity per atom (Rulebook section 4). */
const DEFAULT_LEGAL_SENSITIVITY: Record<CanonicalAtom, number> = {
  INSULT: 2,
  VIOLENCE: 3,
  SEXUAL: 3,
  SUBSTANCES: 3,
  DISCRIMINATION: 4,
  CHILD_SAFETY: 4,
  WOMEN: 3,
  MISINFORMATION: 3,
  PUBLIC_ORDER: 4,
  EXTREMISM: 4,
  INTERNATIONAL: 3,
  ECONOMIC: 3,
  PRIVACY: 3,
  APPEARANCE: 2,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function scoreToSeverity(score: number): Severity {
  if (score >= 14) return "critical";
  if (score >= 11) return "high";
  if (score >= 7) return "medium";
  return "low";
}

function severityRank(s: Severity): number {
  const r: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return r[s] ?? 0;
}

export type CalculateSeverityInput = {
  canonical_atom: CanonicalAtom | string | null;
  intensity: number;
  context_impact: number;
  legal_sensitivity?: number | null;
  audience_risk?: number | null;
};

/**
 * Compute severity from factors per GCAM Severity Rulebook (v2).
 * Applies per-atom defaults, base score mapping, then global and per-atom overrides.
 */
export function calculateSeverity(input: CalculateSeverityInput): Severity {
  const atom = input.canonical_atom != null && CANONICAL_ATOMS.includes(input.canonical_atom as CanonicalAtom)
    ? (input.canonical_atom as CanonicalAtom)
    : null;

  const i = clamp(Number(input.intensity) || 1, 1, 4);
  const ctx = clamp(Number(input.context_impact) || 1, 1, 4);
  let legal = input.legal_sensitivity != null ? clamp(Number(input.legal_sensitivity), 1, 4) : null;
  let audience = input.audience_risk != null ? clamp(Number(input.audience_risk), 1, 4) : 1;

  if (legal == null && atom != null) {
    legal = DEFAULT_LEGAL_SENSITIVITY[atom];
  }
  legal = legal ?? 2;

  // CHILD_SAFETY: Audience Risk = 4 (always)
  if (atom === "CHILD_SAFETY") {
    audience = 4;
  }

  let score = i + ctx + legal + audience;
  let severity = scoreToSeverity(score);

  // ─── Global overrides (Rulebook section 5) ───
  if (atom === "CHILD_SAFETY" && (i >= 4 || audience >= 4)) {
    return "critical"; // Child abuse
  }
  if (atom === "SEXUAL" && i >= 4 && (ctx >= 3 || audience >= 3)) {
    return "critical"; // Sexual violence / graphic coercive
  }
  if (atom === "SEXUAL" && audience >= 4) {
    return "critical"; // Minors involved → CRITICAL
  }
  if (atom === "EXTREMISM" && i >= 4) {
    return "critical"; // Promotion → CRITICAL
  }
  if (atom === "PUBLIC_ORDER" && i >= 4 && ctx >= 3) {
    return "critical"; // Explicit incitement to violence / chaos
  }
  if (atom === "DISCRIMINATION" && i >= 4 && (ctx >= 3 || audience >= 3)) {
    return "critical"; // Call to harm → CRITICAL (hate speech)
  }

  // Always ≥ HIGH
  if (atom === "VIOLENCE" && (i >= 4 || (i >= 3 && (ctx >= 3 || audience >= 3)))) {
    if (severityRank(severity) < severityRank("high")) severity = "high"; // Weapon violence
  }
  if (atom === "EXTREMISM" && (i >= 3 || ctx >= 3)) {
    if (severityRank(severity) < severityRank("high")) severity = "high"; // Always ≥ HIGH
  }
  if (atom === "WOMEN" && i >= 4 && (ctx >= 3 || audience >= 3)) {
    if (severityRank(severity) < severityRank("high")) severity = "high"; // Harassment with coercion
  }
  if (atom === "PUBLIC_ORDER" && i >= 3 && ctx >= 3) {
    if (severityRank(severity) < severityRank("high")) severity = "high";
  }

  return severity;
}
