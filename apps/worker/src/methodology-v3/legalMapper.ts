import type { HybridFindingLike } from "./contextArbiter.js";
import { primaryPillarForArticle, secondaryPillarsForArticle } from "./pillarPolicy.js";
import { clusterByOverlap, clusterCanonicalKey } from "./canonicalClustering.js";

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
  return f.atom_id ? 2 : 1;
}

/** Broad articles that must not override more specific ones when severity is comparable. */
const BROAD_ARTICLES = new Set([4, 5]);

function broadArticleRank(f: HybridFindingLike): number {
  return BROAD_ARTICLES.has(f.article_id) ? 0 : 1;
}

/**
 * Primary selection: role primary > legal specificity (atom) > non-broad > severity > confidence > article id.
 */
function primaryScore(f: HybridFindingLike): number[] {
  return [
    roleRank(f),
    legalSpecificityRank(f),
    broadArticleRank(f),
    severityRank(f.severity),
    Math.round((f.confidence ?? 0) * 100),
    -(f.article_id ?? 999),
  ];
}

function choosePrimary(list: HybridFindingLike[]): HybridFindingLike {
  return [...list].sort((a, b) => {
    const sa = primaryScore(a);
    const sb = primaryScore(b);
    for (let i = 0; i < sa.length; i++) {
      const d = (sb[i] ?? 0) - (sa[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  })[0];
}

/**
 * Group findings by overlap-based canonical clusters, then attach one primary article
 * and merged related articles per cluster. Single canonical finding per incident.
 */
export function attachLegalLinkMetadata(findings: HybridFindingLike[]): HybridFindingLike[] {
  const clusters = clusterByOverlap(findings, 0.4);
  const out: HybridFindingLike[] = [];
  for (const list of clusters.values()) {
    const primary = choosePrimary(list);
    const relatedArticleIds = [...new Set(list.map((x) => x.article_id).filter((id) => id !== primary.article_id))];
    const canonicalId = `CF-${Buffer.from(clusterCanonicalKey(list)).toString("base64").replace(/=+$/g, "").slice(0, 20)}`;
    for (const f of list) {
      out.push({
        ...f,
        rationale_ar:
          f.rationale_ar ??
          (f.article_id === primary.article_id
            ? "تم اعتماد هذا المقال كمرجع قانوني أساسي للمخالفة."
            : "مادة مرتبطة بنفس المخالفة (مرجع ثانوي)."),
        policy_links: [
          { article_id: primary.article_id, role: "primary" },
          ...relatedArticleIds.map((id) => ({ article_id: id, role: "related" as const })),
        ],
        primary_article_id: primary.article_id,
        related_article_ids: relatedArticleIds,
        canonical_finding_id: canonicalId,
        pillar_id: primaryPillarForArticle(primary.article_id),
        secondary_pillar_ids: secondaryPillarsForArticle(primary.article_id),
      });
    }
  }
  return out;
}
