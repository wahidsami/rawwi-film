import type { LexiconTerm } from "@/api/models";

export type GlossaryPdfRow = {
  term: string;
  description: string;
  type: string;
  category: string;
  severity: string;
  mode: string;
  article: string;
};

export function mapGlossaryDataForPdf(terms: LexiconTerm[], lang: "ar" | "en") {
  const rows: GlossaryPdfRow[] = (terms || []).filter(Boolean).map((t) => ({
    term: t.term || "",
    description: t.description || "",
    type:
      t.term_type === "regex"
        ? (lang === "ar" ? "تعبير" : "Regex")
        : t.term_type === "phrase"
          ? (lang === "ar" ? "عبارة" : "Phrase")
          : (lang === "ar" ? "كلمة" : "Word"),
    category: t.category || "",
    severity: t.severity_floor || "",
    mode: t.enforcement_mode === "mandatory_finding" ? (lang === "ar" ? "إلزامي" : "Mandatory") : (lang === "ar" ? "إشارة" : "Signal"),
    article: `${lang === "ar" ? "مادة" : "Art"} ${t.gcam_article_id}${t.gcam_atom_id ? ` (${t.gcam_atom_id})` : ""}`,
  }));

  const total = terms.length;
  const soft = terms.filter((t) => t.enforcement_mode === "soft_signal").length;
  const mandatory = terms.filter((t) => t.enforcement_mode === "mandatory_finding").length;
  return { rows, total, soft, mandatory };
}
