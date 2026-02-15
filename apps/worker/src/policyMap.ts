/**
 * Policy map: single source of truth for articles and atoms (Raawi report taxonomy).
 * Loads from PolicyMap.json at repo root.
 * Article 25 = admin only; Article 26 = out of scope (no findings).
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const POLICY_MAP_PATH = join(__dirname, "..", "..", "..", "PolicyMap.json");

export type PolicyAtom = { atomId: string; title_ar: string };
export type PolicyArticle = {
  articleId: number;
  title_ar: string;
  atoms: PolicyAtom[];
  adminOnly?: boolean;
  outOfScope?: boolean;
};

export type PolicyMapData = { version?: string; articles: PolicyArticle[] };

let cached: PolicyMapData | null = null;

function loadPolicyMap(): PolicyMapData {
  if (cached) return cached;
  const raw = readFileSync(POLICY_MAP_PATH, "utf8");
  cached = JSON.parse(raw) as PolicyMapData;
  return cached;
}

/** All articles in PolicyMap order (1..26). */
export function getPolicyArticles(): PolicyArticle[] {
  return loadPolicyMap().articles;
}

/** Article by id; undefined if not found. */
export function getPolicyArticle(articleId: number): PolicyArticle | undefined {
  return getPolicyArticles().find((a) => a.articleId === articleId);
}

/** Atom title by articleId and atomId (e.g. "12-5"). Returns policy title or fallback. */
export function getPolicyAtomTitle(articleId: number, atomId: string | null): string | undefined {
  if (atomId == null || atomId === "") return undefined;
  const norm = normalizeAtomId(atomId, articleId);
  const art = getPolicyArticle(articleId);
  const atom = art?.atoms?.find((a) => a.atomId === norm);
  return atom?.title_ar;
}

/** Normalize atom id to "article-atom" form (e.g. "12-5", "4-1"). Handles legacy "5.2" -> "5-2". */
export function normalizeAtomId(atomId: string | number | null, articleId?: number): string {
  if (atomId == null || atomId === "") return "";
  const s = String(atomId).trim();
  if (/^\d+-\d+$/.test(s)) return s;
  if (s.includes(".")) {
    const [a, b] = s.split(".");
    const art = articleId ?? (a ? parseInt(a, 10) : undefined);
    const atomNum = b != null ? parseInt(b, 10) : NaN;
    if (art != null && !Number.isNaN(art) && !Number.isNaN(atomNum)) return `${art}-${atomNum}`;
  }
  const num = typeof atomId === "number" ? atomId : parseInt(s.replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(num)) return s;
  const art = articleId ?? (s.includes(".") ? parseInt(s.split(".")[0], 10) : undefined);
  if (art != null && !Number.isNaN(art)) return `${art}-${num}`;
  return s;
}

/** Numeric part of atom id for sorting (e.g. "12-5" -> 5). */
export function atomIdNumeric(atomId: string | null): number {
  if (!atomId) return 0;
  const m = String(atomId).match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Allowed atom ids for an article (e.g. ["4-1","4-2",...]). Empty if article has no atoms. */
export function getPolicyAtomIdsForArticle(articleId: number): string[] {
  const art = getPolicyArticle(articleId);
  return (art?.atoms ?? []).map((a) => a.atomId);
}

/** Return true if atomId is valid for the given articleId (exact or normalized match). */
export function isValidAtomForArticle(articleId: number, atomId: string | null | undefined): boolean {
  if (atomId == null || atomId === "") return true;
  const allowed = getPolicyAtomIdsForArticle(articleId);
  if (allowed.length === 0) return true;
  const norm = normalizeAtomId(atomId, articleId);
  return allowed.includes(norm);
}

/** Article ids that can have AI/lexicon findings (excludes 25 admin, 26 out-of-scope). */
export function getScannableArticleIds(): number[] {
  return getPolicyArticles()
    .filter((a) => !a.adminOnly && !a.outOfScope)
    .map((a) => a.articleId);
}

export const ADMIN_ONLY_ARTICLE_ID = 25;
export const OUT_OF_SCOPE_ARTICLE_ID = 26;
