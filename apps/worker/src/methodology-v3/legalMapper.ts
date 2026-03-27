import type { HybridFindingLike } from "./contextArbiter.js";
import { primaryPillarForArticle, secondaryPillarsForArticle } from "./pillarPolicy.js";
import { clusterByOverlap, clusterCanonicalKey } from "./canonicalClustering.js";

const LEGAL_LINK_OVERLAP_RATIO = 0.85;

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

function compareFindingsStable(a: HybridFindingLike, b: HybridFindingLike): number {
  return (
    (a.start_offset_global ?? 0) - (b.start_offset_global ?? 0) ||
    (a.end_offset_global ?? 0) - (b.end_offset_global ?? 0) ||
    (a.article_id ?? 0) - (b.article_id ?? 0) ||
    String(a.atom_id ?? "").localeCompare(String(b.atom_id ?? ""), "ar") ||
    String(a.evidence_snippet ?? "").localeCompare(String(b.evidence_snippet ?? ""), "ar") ||
    String(a.title_ar ?? "").localeCompare(String(b.title_ar ?? ""), "ar")
  );
}

function choosePrimary(list: HybridFindingLike[]): HybridFindingLike {
  const specific = list.filter((f) => !BROAD_ARTICLES.has(f.article_id));
  const candidateList = specific.length > 0 ? specific : list;
  return [...candidateList].sort((a, b) => {
    const sa = primaryScore(a);
    const sb = primaryScore(b);
    for (let i = 0; i < sa.length; i++) {
      const d = (sb[i] ?? 0) - (sa[i] ?? 0);
      if (d !== 0) return d;
    }
    return compareFindingsStable(a, b);
  })[0];
}

/**
 * Group findings by overlap-based canonical clusters, then attach one primary article
 * and merged related articles per cluster. Single canonical finding per incident.
 */
export function attachLegalLinkMetadata(findings: HybridFindingLike[]): HybridFindingLike[] {
  const clusters = clusterByOverlap(findings, LEGAL_LINK_OVERLAP_RATIO);
  const out: HybridFindingLike[] = [];
  for (const list of clusters.values()) {
    const primary = choosePrimary(list);
    const relatedArticleIds = [...new Set(list.map((x) => x.article_id).filter((id) => id !== primary.article_id))].sort((a, b) => a - b);
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
