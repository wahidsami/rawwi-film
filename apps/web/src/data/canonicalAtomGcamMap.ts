/**
 * Canonical atom → primary GCAM (article + atom) for Glossary "Canonical atom" dropdown.
 * Aligns with worker canonicalAtomMapping.ts first ref per atom.
 */
import { getPolicyArticles } from './policyMap';

export const CANONICAL_ATOMS = [
  'INSULT',
  'VIOLENCE',
  'SEXUAL',
  'SUBSTANCES',
  'DISCRIMINATION',
  'CHILD_SAFETY',
  'WOMEN',
  'MISINFORMATION',
  'PUBLIC_ORDER',
  'EXTREMISM',
  'INTERNATIONAL',
  'ECONOMIC',
  'PRIVACY',
  'APPEARANCE',
] as const;

export type CanonicalAtomId = (typeof CANONICAL_ATOMS)[number];

/** First GCAM key per canonical atom (from Framework mapped list). */
const FIRST_GCAM_KEY: Record<CanonicalAtomId, string> = {
  INSULT: '4-1',
  VIOLENCE: '4',
  SEXUAL: '4-7',
  SUBSTANCES: '5-4',
  DISCRIMINATION: '5',
  CHILD_SAFETY: '6-1',
  WOMEN: '7-1',
  MISINFORMATION: '11',
  PUBLIC_ORDER: '12',
  EXTREMISM: '9-2',
  INTERNATIONAL: '18',
  ECONOMIC: '19',
  PRIVACY: '17',
  APPEARANCE: '23',
};

function parseKey(key: string): { articleId: number; atomId: string | null } {
  const trimmed = key.trim();
  if (trimmed.includes('-')) {
    const [a, b] = trimmed.split('-');
    const articleId = parseInt(a ?? '', 10);
    const atomId = b != null && b !== '' ? `${articleId}-${b}` : null;
    return { articleId: Number.isFinite(articleId) ? articleId : 0, atomId };
  }
  const articleId = parseInt(trimmed, 10);
  return { articleId: Number.isFinite(articleId) ? articleId : 0, atomId: null };
}

export type CanonicalAtomOption = {
  id: CanonicalAtomId;
  labelAr: string;
  labelEn: string;
  articleId: number;
  atomId: string | null;
};

const LABELS: Record<CanonicalAtomId, { ar: string; en: string }> = {
  INSULT: { ar: 'إهانة', en: 'Insult' },
  VIOLENCE: { ar: 'عنف', en: 'Violence' },
  SEXUAL: { ar: 'محتوى جنسي', en: 'Sexual' },
  SUBSTANCES: { ar: 'مخدرات/مواد', en: 'Substances' },
  DISCRIMINATION: { ar: 'تمييز', en: 'Discrimination' },
  CHILD_SAFETY: { ar: 'سلامة الطفل', en: 'Child Safety' },
  WOMEN: { ar: 'المرأة', en: 'Women' },
  MISINFORMATION: { ar: 'معلومات مضللة', en: 'Misinformation' },
  PUBLIC_ORDER: { ar: 'النظام العام', en: 'Public Order' },
  EXTREMISM: { ar: 'التطرف', en: 'Extremism' },
  INTERNATIONAL: { ar: 'دولي', en: 'International' },
  ECONOMIC: { ar: 'اقتصادي', en: 'Economic' },
  PRIVACY: { ar: 'خصوصية', en: 'Privacy' },
  APPEARANCE: { ar: 'مظهر', en: 'Appearance' },
};

/** Infer canonical atom from stored GCAM article/atom (for edit form). */
export function inferCanonicalAtomFromGcam(articleId: number, atomId: string | null | undefined): CanonicalAtomId | '' {
  const opts = getCanonicalAtomOptions();
  const tAtom = (atomId ?? '').trim();
  const exact = opts.find((o) => o.articleId === articleId && (o.atomId ?? '').trim() === tAtom);
  if (exact) return exact.id;
  const byArticle = opts.find((o) => o.articleId === articleId);
  return byArticle?.id ?? '';
}

/** Options for the Canonical atom dropdown with resolved articleId and atomId. */
export function getCanonicalAtomOptions(): CanonicalAtomOption[] {
  const articles = getPolicyArticles();
  return CANONICAL_ATOMS.map((id) => {
    const key = FIRST_GCAM_KEY[id];
    const { articleId, atomId: rawAtomId } = parseKey(key);
    let atomId = rawAtomId;
    if (atomId == null && articleId >= 1) {
      const art = articles.find((a) => a.articleId === articleId);
      atomId = art?.atoms?.[0]?.atomId ?? null;
    }
    const labels = LABELS[id];
    return {
      id,
      labelAr: labels.ar,
      labelEn: labels.en,
      articleId,
      atomId,
    };
  });
}
