import type { ContextWindow } from "./segmenter.js";
import { containsAnyNormalized } from "../textDetectionNormalize.js";

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
const REPORTING_HINTS = [
  "قال",
  "تقول",
  "يقول",
  "يروي",
  "روى",
  "يذكر",
  "ذكرت",
  "ذكر",
  "يحكي",
  "حكت",
  "أخبر",
  "اخبر",
  "أخبرت",
  "اخبرت",
  "يشرح",
  "تشرح",
  "سمعت",
  "سمع",
  "سألت",
  "يسأل",
  "سأل",
];
const NEGATION_HINTS = ["لا ", "لم ", "لن ", "ليس", "ما كان", "ما صار", "مو ", "دون "];
const CONSEQUENCE_HINTS = ["خوف", "رعب", "يبكي", "تبكي", "دموع", "ألم", "معاناة", "مصاب", "مستشفى", "نزيف", "جروح"];

function containsAny(text: string, tokens: string[]): boolean {
  return containsAnyNormalized(text, tokens);
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
    const hasReporting = containsAny(text, REPORTING_HINTS);
    const hasNegation = containsAny(text, NEGATION_HINTS);
    const hasConsequences = containsAny(text, CONSEQUENCE_HINTS);
    const depiction_type =
      hasCondemnation || (hasConsequences && !hasEndorsement) ? "condemnation"
      : hasEndorsement ? "endorsement"
      : f.source === "lexicon_mandatory" || hasReporting || hasNegation ? "mention"
      : "depiction";
    const context_confidence =
      depiction_type === "condemnation" ? 0.84
      : depiction_type === "endorsement" ? 0.8
      : depiction_type === "mention" ? 0.76
      : 0.55;
    const rationale_ar =
      depiction_type === "condemnation"
        ? "السياق السردي يبرز الإدانة أو العواقب السلبية للمشهد، ولا يقدمه كتطبيع أو تمجيد."
        : depiction_type === "endorsement"
          ? "السياق السردي يميل إلى التمجيد أو التطبيع مع السلوك المرصود ويحتاج تشدداً سياساتياً."
          : depiction_type === "mention"
            ? "السياق يورد المحتوى على لسان شخصية أو بوصف لاحق/منقول، دون تقديم مباشر له كفعل مُمجَّد داخل المشهد."
            : "السياق يعرض الفعل أو اللفظ مباشرة داخل المشهد ويحتاج وزناً سياساتياً كاملاً.";
    return {
      ...f,
      depiction_type,
      speaker_role: f.speaker_role ?? "unknown",
      context_window_id: f.context_window_id ?? windows[idx]?.id ?? null,
      context_confidence,
      lexical_confidence: f.source === "lexicon_mandatory" ? 1 : (f.lexical_confidence ?? 0.65),
      rationale_ar,
    };
  });
}
