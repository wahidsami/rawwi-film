import type { HybridFindingLike } from "./contextArbiter.js";
import { primaryPillarForArticle, secondaryPillarsForArticle } from "./pillarPolicy.js";

function severityRank(s: string): number {
  const r: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return r[s] ?? 0;
}

function roleRank(f: HybridFindingLike): number {
  const links = f.policy_links ?? [];
  const own = links.find((l) => l.article_id === f.article_id);
  if (own?.role === "primary") return 3;
  if (own?.role === "related") return 2;
  return 1;
}

function legalSpecificityRank(f: HybridFindingLike): number {
  // Prefer sub-article specificity (has atom) over broad article-only mapping.
  return f.atom_id ? 2 : 1;
}

function canonicalKey(f: HybridFindingLike): string {
  const start = f.start_offset_global ?? 0;
  const end = f.end_offset_global ?? start;
  return `${start}:${end}:${(f.evidence_snippet || "").slice(0, 120)}`;
}

/**
 * Safe/non-breaking mapper:
 * - Keep all findings
 * - Annotate each with canonical finding id and related article list
 * - Mark one primary article for the canonical group
 */
export function attachLegalLinkMetadata(findings: HybridFindingLike[]): HybridFindingLike[] {
  const groups = new Map<string, HybridFindingLike[]>();
  for (const f of findings) {
    const key = canonicalKey(f);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f);
  }
  const out: HybridFindingLike[] = [];
  for (const [key, list] of groups.entries()) {
    const sorted = [...list].sort((a, b) => {
      const role = roleRank(b) - roleRank(a);
      if (role !== 0) return role;
      const sev = severityRank(b.severity) - severityRank(a.severity);
      if (sev !== 0) return sev;
      const legalSpecificity = legalSpecificityRank(b) - legalSpecificityRank(a);
      if (legalSpecificity !== 0) return legalSpecificity;
      const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (conf !== 0) return conf;
      return (a.article_id ?? 999) - (b.article_id ?? 999);
    });
    const primary = sorted[0];
    const relatedArticleIds = [...new Set(sorted.map((x) => x.article_id).filter((x) => x !== primary.article_id))];
    for (const f of list) {
      const isPrimary = f.article_id === primary.article_id;
      out.push({
        ...f,
        rationale_ar:
          f.rationale_ar ??
          (isPrimary
            ? "تم اعتماد هذا المقال كمرجع قانوني أساسي للمخالفة."
            : "مادة مرتبطة بنفس المخالفة (مرجع ثانوي)."),
        policy_links: [
          { article_id: primary.article_id, role: "primary" },
          ...relatedArticleIds.map((id) => ({ article_id: id, role: "related" as const })),
        ],
        primary_article_id: primary.article_id,
        related_article_ids: relatedArticleIds,
        canonical_finding_id: `CF-${Buffer.from(key).toString("base64").replace(/=+$/g, "").slice(0, 16)}`,
        pillar_id: primaryPillarForArticle(f.article_id),
        secondary_pillar_ids: secondaryPillarsForArticle(f.article_id),
      });
    }
  }
  return out;
}
