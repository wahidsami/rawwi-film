/**
 * GCAM article list for Router/Judge. Uses PolicyMap (single source of truth).
 * Article 25 = admin only (never from AI); Article 26 = out of scope.
 */
import { getPolicyArticle, getScannableArticleIds } from "./policyMap.js";

export const ALWAYS_CHECK_ARTICLES = [4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 23, 24] as const;

export type GCAMArticle = {
  id: number;
  title_ar: string;
  text_ar?: string;
  atoms?: { atom_id: string; text_ar: string }[];
};

export function getScriptStandardArticle(id: number): GCAMArticle {
  const art = getPolicyArticle(id);
  if (art) {
    const atoms = (art.atoms ?? []).map((a) => ({ atom_id: a.atomId, text_ar: a.title_ar }));
    return {
      id: art.articleId,
      title_ar: art.title_ar,
      text_ar: art.title_ar,
      atoms,
    };
  }
  return {
    id,
    title_ar: `المادة ${id}`,
    text_ar: `المادة ${id}`,
    atoms: [],
  };
}

/** Scannable articles only (1–24); excludes 25 admin, 26 out-of-scope. */
export function getScriptStandardRouterList(): GCAMArticle[] {
  return getScannableArticleIds().map((id) => getScriptStandardArticle(id));
}
