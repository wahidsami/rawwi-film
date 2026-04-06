/**
 * Policy map: single source of truth for articles and atoms (Raawi report taxonomy).
 * Loaded from PolicyMap.json at repo root. Article 25 = admin only; 26 = out of scope.
 */
import policyMapJson from "./PolicyMap.json";

export type PolicyAtom = { atomId: string; title_ar: string };
export type PolicyArticle = {
  articleId: number;
  title_ar: string;
  atoms: PolicyAtom[];
  adminOnly?: boolean;
  outOfScope?: boolean;
};

export type PolicyMapData = { version?: string; articles: PolicyArticle[] };

const data = policyMapJson as PolicyMapData;

/** All articles in PolicyMap order (1..26). */
export function getPolicyArticles(): PolicyArticle[] {
  return data.articles;
}

/** Reviewer/actionable articles only: excludes admin/out-of-scope/empty-definition rows. */
export function getActionablePolicyArticles(): PolicyArticle[] {
  return getPolicyArticles().filter((a) => !a.adminOnly && !a.outOfScope && (a.atoms?.length ?? 0) > 0);
}

export function getActionablePolicyArticleIds(): number[] {
  return getActionablePolicyArticles().map((a) => a.articleId);
}

/** Article by id. */
export function getPolicyArticle(articleId: number): PolicyArticle | undefined {
  return getPolicyArticles().find((a) => a.articleId === articleId);
}

/** Atom title by articleId and atomId (e.g. "12-5"). */
export function getPolicyAtomTitle(articleId: number, atomId: string | null): string | undefined {
  if (atomId == null || atomId === "") return undefined;
  const norm = normalizeAtomId(atomId, articleId);
  const art = getPolicyArticle(articleId);
  const atom = art?.atoms?.find((a) => a.atomId === norm);
  return atom?.title_ar;
}

/** Normalize atom id to "article-atom" form (e.g. "12-5"). */
export function normalizeAtomId(atomId: string | number | null, articleId?: number): string {
  if (atomId == null || atomId === "") return "";
  const s = String(atomId).trim();
  if (/^\d+-\d+$/.test(s)) return s;
  const num = typeof atomId === "number" ? atomId : parseInt(s.replace(/[^\d]/g, ""), 10);
  if (Number.isNaN(num)) return s;
  const art = articleId ?? (s.includes(".") ? parseInt(s.split(".")[0], 10) : undefined);
  if (art != null && !Number.isNaN(art)) return `${art}-${num}`;
  return s;
}

/** Numeric part of atom id for sorting. */
export function atomIdNumeric(atomId: string | null): number {
  if (!atomId) return 0;
  const m = String(atomId).match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Domain id for UI grouping (A–E). Keeps current visual hierarchy. */
const ARTICLE_DOMAIN: Record<number, string> = (() => {
  const arts = data.articles;
  const m: Record<number, string> = {};
  const domains = ["A", "B", "C", "D", "E"];
  const per = Math.ceil(26 / domains.length);
  arts.forEach((a, i) => {
    m[a.articleId] = domains[Math.min(Math.floor(i / per), domains.length - 1)];
  });
  return m;
})();

export function getArticleDomainId(articleId: number): string {
  return ARTICLE_DOMAIN[articleId] ?? "E";
}

export const ADMIN_ONLY_ARTICLE_ID = 25;
export const OUT_OF_SCOPE_ARTICLE_ID = 26;

/** Every PolicyMap atom with domain (A–E) for checklists. Excludes out-of-scope article 26. */
export function getPolicyAtomsFlat(): Array<{
  atomId: string;
  articleId: number;
  titleAr: string;
  domainId: string;
}> {
  const out: Array<{ atomId: string; articleId: number; titleAr: string; domainId: string }> = [];
  for (const a of getPolicyArticles()) {
    if (a.articleId === OUT_OF_SCOPE_ARTICLE_ID) continue;
    const domainId = getArticleDomainId(a.articleId);
    for (const atom of a.atoms ?? []) {
      out.push({
        atomId: atom.atomId,
        articleId: a.articleId,
        titleAr: atom.title_ar,
        domainId,
      });
    }
  }
  return out;
}

export function countPolicyAtoms(): number {
  return getPolicyAtomsFlat().length;
}
