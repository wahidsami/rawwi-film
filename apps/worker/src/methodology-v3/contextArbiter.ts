import type { ContextWindow } from "./segmenter.js";

export type HybridFindingLike = {
  source?: string;
  article_id: number;
  atom_id?: string | null;
  severity: string;
  confidence: number;
  title_ar: string;
  description_ar?: string;
  evidence_snippet: string;
  start_offset_global?: number;
  end_offset_global?: number;
  depiction_type?: "mention" | "depiction" | "endorsement" | "condemnation" | "unknown";
  speaker_role?: "narrator" | "hero" | "villain" | "supporting" | "unknown";
  context_window_id?: string | null;
  context_confidence?: number | null;
  lexical_confidence?: number | null;
  policy_confidence?: number | null;
  rationale_ar?: string | null;
  final_ruling?: "violation" | "needs_review" | "context_ok" | null;
  narrative_consequence?: "punished" | "rewarded" | "neutralized" | "unresolved" | "unknown";
  policy_links?: Array<{ article_id: number; atom_concept_id?: string | null; role?: string | null }>;
  primary_article_id?: number;
  related_article_ids?: number[];
  canonical_finding_id?: string;
  pillar_id?: string;
  secondary_pillar_ids?: string[];
};

const CONDEMNATION_HINTS = ["ممنوع", "غير مقبول", "تنديد", "عوقب", "عقوبة", "ندم", "اعتذر", "رفض", "رفضت"];
const ENDORSEMENT_HINTS = ["يمجّد", "ممتاز", "بطولي", "رائع", "قدوة", "نجح بسبب", "كافأ", "مكافأة"];

function containsAny(text: string, tokens: string[]): boolean {
  const t = text.toLowerCase();
  return tokens.some((x) => t.includes(x.toLowerCase()));
}

export function arbitrateContext(
  findings: HybridFindingLike[],
  windows: ContextWindow[]
): HybridFindingLike[] {
  const byId = new Map<string, ContextWindow>(windows.map((w) => [w.id, w]));
  return findings.map((f, idx) => {
    const window = f.context_window_id ? byId.get(f.context_window_id) : undefined;
    const text = window?.text ?? "";
    const hasCondemnation = containsAny(text, CONDEMNATION_HINTS);
    const hasEndorsement = containsAny(text, ENDORSEMENT_HINTS);
    const depiction_type =
      hasCondemnation ? "condemnation"
      : hasEndorsement ? "endorsement"
      : f.source === "lexicon_mandatory" ? "mention"
      : "depiction";
    const context_confidence = hasCondemnation || hasEndorsement ? 0.78 : 0.55;
    return {
      ...f,
      depiction_type,
      speaker_role: f.speaker_role ?? "unknown",
      context_window_id: f.context_window_id ?? windows[idx]?.id ?? null,
      context_confidence,
      lexical_confidence: f.source === "lexicon_mandatory" ? 1 : (f.lexical_confidence ?? 0.65),
      rationale_ar:
        depiction_type === "condemnation"
          ? "السياق السردي يشير إلى الإدانة أو العواقب."
          : depiction_type === "endorsement"
            ? "السياق السردي يميل إلى التمجيد أو التطبيع."
            : "المؤشر سياقي محايد ويحتاج وزنًا سياساتيًا.",
    };
  });
}
