/**
 * Canonical Atom ↔ GCAM mapping from GCAM Canonical Atom Framework (v1).
 * Used to derive article_id/atom_id when AI returns only canonical_atom, and to validate.
 */
import { type CanonicalAtom, CANONICAL_ATOMS } from "./severityRulebook.js";
import { getPolicyAtomIdsForArticle } from "./policyMap.js";

export type GcamRef = { article_id: number; atom_id: string | null };

/** Mapped GCAM atoms per Framework doc (Mapped GCAM Atoms per canonical atom). */
const CANONICAL_TO_GCAM: Record<CanonicalAtom, string[]> = {
  INSULT: ["4-1", "5-2", "7-2", "17-1", "17-2"],
  VIOLENCE: ["4", "5-1", "6-1", "9-1", "9-3"],
  SEXUAL: ["4-7", "5-3", "9-4", "23", "24"],
  SUBSTANCES: ["5-4", "10-1", "10-2", "10-3", "10-4", "10-5"],
  DISCRIMINATION: ["5", "7", "8"],
  CHILD_SAFETY: ["6-1", "6-2", "6-3", "6-4", "6-5"],
  WOMEN: ["7-1", "7-2", "7-3", "7-4", "7-5"],
  MISINFORMATION: ["11", "16"],
  PUBLIC_ORDER: ["12", "13", "14"],
  EXTREMISM: ["9-2", "15"],
  INTERNATIONAL: ["18"],
  ECONOMIC: ["19", "20"],
  PRIVACY: ["17"],
  APPEARANCE: ["23", "24"],
};

function parseGcamKey(key: string): GcamRef {
  const trimmed = key.trim();
  if (trimmed.includes("-")) {
    const [a, b] = trimmed.split("-");
    const article_id = parseInt(a ?? "", 10);
    const atom_id = b != null && b !== "" ? `${article_id}-${b}` : null;
    return { article_id: Number.isFinite(article_id) ? article_id : 0, atom_id };
  }
  const article_id = parseInt(trimmed, 10);
  return { article_id: Number.isFinite(article_id) ? article_id : 0, atom_id: null };
}

/** All GCAM refs for a canonical atom (Framework "Mapped GCAM Atoms"). */
export function getGcamRefsForCanonicalAtom(canonical_atom: CanonicalAtom | string): GcamRef[] {
  const list = CANONICAL_TO_GCAM[canonical_atom as CanonicalAtom];
  if (!list) return [];
  return list.map(parseGcamKey).filter((r) => r.article_id >= 1);
}

/**
 * Primary GCAM for a canonical atom: first mapped ref.
 * Use when AI returns canonical_atom but not article_id/atom_id (e.g. for DB and reports).
 */
export function getPrimaryGcamForCanonicalAtom(canonical_atom: CanonicalAtom | string): GcamRef | null {
  const refs = getGcamRefsForCanonicalAtom(canonical_atom);
  if (refs.length === 0) return null;
  const first = refs[0];
  if (first.atom_id) return first;
  const atomIds = getPolicyAtomIdsForArticle(first.article_id);
  return {
    article_id: first.article_id,
    atom_id: atomIds.length > 0 ? atomIds[0] : null,
  };
}

/**
 * Return true if (article_id, atom_id) is in the mapped set for the given canonical_atom.
 * atom_id can be normalized (e.g. "5-2").
 */
export function isGcamMappedToCanonical(
  canonical_atom: CanonicalAtom | string,
  article_id: number,
  atom_id: string | null
): boolean {
  const refs = getGcamRefsForCanonicalAtom(canonical_atom);
  const norm = (r: GcamRef) => `${r.article_id}:${r.atom_id ?? ""}`;
  const key = `${article_id}:${atom_id ?? ""}`;
  return refs.some((r) => norm(r) === key);
}

/** Canonical atoms that map to this (article_id, atom_id). Used for lexicon/manual to set canonical_atom. */
export function getCanonicalAtomsForGcam(article_id: number, atom_id: string | null): CanonicalAtom[] {
  const out: CanonicalAtom[] = [];
  for (const atom of CANONICAL_ATOMS) {
    if (isGcamMappedToCanonical(atom, article_id, atom_id)) out.push(atom);
  }
  return out;
}

/** First canonical atom for this GCAM ref, or null. Use for lexicon when we need a single primary. */
export function getPrimaryCanonicalAtomForGcam(article_id: number, atom_id: string | null): CanonicalAtom | null {
  const list = getCanonicalAtomsForGcam(article_id, atom_id);
  return list.length > 0 ? list[0] : null;
}
