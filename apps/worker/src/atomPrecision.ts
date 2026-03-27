import type { JudgeFinding } from "./schemas.js";
import { canonicalArabicToken } from "./lexiconCache.js";
import { getPrimaryCanonicalAtomForGcam } from "./canonicalAtomMapping.js";

function normalizeText(value: string): string {
  return canonicalArabicToken(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function combinedFindingText(finding: JudgeFinding): string {
  return normalizeText([
    finding.title_ar ?? "",
    finding.description_ar ?? "",
    finding.evidence_snippet ?? "",
    finding.rationale_ar ?? "",
  ].join(" "));
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalizeText(needle)));
}

function withPolicy(finding: JudgeFinding, articleId: number, atomId: string | null): JudgeFinding {
  return {
    ...finding,
    article_id: articleId,
    atom_id: atomId,
    canonical_atom: getPrimaryCanonicalAtomForGcam(articleId, atomId) ?? finding.canonical_atom ?? null,
  };
}

export function refineAtomPrecision(finding: JudgeFinding): JudgeFinding {
  const text = combinedFindingText(finding);
  if (!text) return finding;

  if (
    includesAny(text, ["هي السبب", "استاهلت", "لو انها", "لأنها تعرضت", "بسبب لبسها", "هي اللي جابت"]) &&
    includesAny(text, ["تحرش", "اعتدى", "ضرب", "لمس", "اساءة", "إساءة"])
  ) {
    return withPolicy(finding, 7, "7-4");
  }

  if (
    includesAny(text, ["المسك شيء عادي", "شيء عادي", "مزح", "عادي", "طبيعي"]) &&
    includesAny(text, ["ألمسك", "المسك", "لمس", "تحرش", "إكراه", "اكراه", "رفضت"])
  ) {
    return withPolicy(finding, 7, "7-3");
  }

  if (
    includesAny(text, ["مكان البنت", "المطبخ", "السرير", "انتي ملك", "أنت ملك", "مكان المرأة"]) &&
    includesAny(text, ["امرأة", "المراة", "بنت", "نساء", "زوجة", "انتي", "أنت"])
  ) {
    return withPolicy(finding, 7, "7-2");
  }

  if (
    includesAny(text, ["لا تطلعين", "ممنوع تطلعين", "ممنوع تروحين", "انتي ملك", "ما لك قرار", "بدون اذني", "بدون إذني"])
  ) {
    return withPolicy(finding, 7, "7-5");
  }

  if (
    includesAny(text, ["العنف هو الحل", "الضرب هو الحل", "لا يفهم الا بالضرب", "لا يفهم إلا بالضرب", "نكسر راسه", "نكسر رأسه", "بالعنف", "نقتله", "نذبحه"]) &&
    includesAny(text, ["حل", "تمجيد", "عنف", "ضرب", "قتل", "ردع"])
  ) {
    return withPolicy(finding, 9, "9-1");
  }

  if (
    includesAny(text, ["عديم الكرامة", "بلا كرامة", "ما لك قيمة", "لا قيمة لك", "تافه", "حقير", "منعدم الكرامة"]) &&
    !includesAny(text, ["مكان البنت", "المطبخ", "السرير"])
  ) {
    return withPolicy(finding, 17, "17-1");
  }

  if (
    finding.canonical_atom === "INSULT" &&
    includesAny(text, ["غبي", "أحمق", "قذر", "حمار", "كلب", "نصاب", "حرامي", "معتوه"])
  ) {
    return withPolicy(finding, 5, "5-2");
  }

  if (
    finding.canonical_atom === "MISINFORMATION" &&
    includesAny(text, ["هذه حقيقة", "مؤكد", "أكيد", "الجميع يعرف", "خبر صحيح"]) &&
    includesAny(text, ["اشاعة", "إشاعة", "شائعة", "مضللة", "غير دقيقة", "كذب"])
  ) {
    return withPolicy(finding, 11, "11-1");
  }

  return finding;
}
