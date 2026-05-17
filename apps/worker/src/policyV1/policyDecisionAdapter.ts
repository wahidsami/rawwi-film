import type { FindingWithGlobal } from "../pipeline.js";
import type { PolicyDecision } from "./policyEngine.js";

type ClauseMeta = {
  articleId: number;
  titleAr: string;
  severity: "low" | "medium" | "high" | "critical";
};

const CLAUSE_META: Record<string, ClauseMeta> = {
  "1.3": { articleId: 3, titleAr: "الإضرار بالأمن الوطني", severity: "high" },
  "1.4": { articleId: 4, titleAr: "المحتوى التاريخي غير الموثوق", severity: "medium" },
  "1.6": { articleId: 6, titleAr: "محتوى الجرائم الموجه للأطفال", severity: "high" },
  "2.1": { articleId: 7, titleAr: "تعليم صناعة المخدرات أو المسكرات", severity: "high" },
  "2.2": { articleId: 6, titleAr: "محتوى الجرائم الموجه للأطفال", severity: "high" },
  "2.3": { articleId: 9, titleAr: "الدعوة الإيجابية للمثلية الجنسية", severity: "high" },
  "2.4": { articleId: 10, titleAr: "المشاهد الجنسية الصريحة", severity: "high" },
  "2.5": { articleId: 11, titleAr: "الألفاظ النابية", severity: "medium" },
};

function clampGlobalOffset(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function adaptPolicyDecisionsToFindings(args: {
  decisions: PolicyDecision[];
  chunkStart: number;
  chunkEnd: number;
  chunkText: string;
}): FindingWithGlobal[] {
  const out: FindingWithGlobal[] = [];
  const { decisions, chunkStart, chunkEnd, chunkText } = args;

  const locateInChunk = (snippet: string): { start: number; end: number } | null => {
    if (!snippet) return null;
    const direct = chunkText.indexOf(snippet);
    if (direct >= 0) return { start: direct, end: direct + snippet.length };

    const compact = (value: string) => value.replace(/\s+/g, " ").trim();
    const compactChunk = compact(chunkText);
    const compactSnippet = compact(snippet);
    if (!compactSnippet) return null;
    const compactIdx = compactChunk.indexOf(compactSnippet);
    if (compactIdx < 0) return null;
    // We cannot map compacted index back exactly; return null to keep conservative behavior.
    return null;
  };
  for (const row of decisions) {
    if (row.status === "rejected") continue;
    const meta = CLAUSE_META[row.regulation_clause] ?? {
      articleId: 17,
      titleAr: "أخرى",
      severity: "medium" as const,
    };
    const snippet = String(row.evidence_snippet ?? "").trim();
    if (!snippet) continue;
    const located = locateInChunk(snippet);
    const localStart = located?.start ?? 0;
    // If not located exactly, force non-sane span (end == start) to avoid false canonical mismatch drops.
    const localEnd = located?.end ?? localStart;
    const globalStart = clampGlobalOffset(chunkStart + localStart, chunkStart);
    const globalEnd = clampGlobalOffset(chunkStart + localEnd, Math.min(chunkStart + localEnd, chunkEnd));
    out.push({
      article_id: meta.articleId,
      atom_id: null,
      title_ar: meta.titleAr,
      description_ar: snippet,
      severity: meta.severity,
      confidence: row.status === "violation" ? 0.86 : 0.72,
      evidence_snippet: snippet,
      location: {
        start_offset: localStart,
        end_offset: localEnd,
        start_line: null,
        end_line: null,
      },
      rationale_ar: row.reason_text_ar,
      detection_pass: `policy_v1_${row.regulation_clause.replace(".", "_")}`,
      source: "ai",
      start_offset_global: globalStart,
      end_offset_global: globalEnd,
      is_interpretive: row.status === "needs_review",
      final_ruling: row.status === "violation" ? "violation" : "needs_review",
      depiction_type: "unknown",
      speaker_role: "unknown",
      narrative_consequence: "unknown",
      context_window_id: null,
      context_confidence: null,
      lexical_confidence: null,
      policy_confidence: null,
    });
  }
  return out;
}
