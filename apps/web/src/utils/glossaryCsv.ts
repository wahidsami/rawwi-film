/**
 * Glossary CSV import/export (aligned with add-term: canonical_atom, term_variants, etc.)
 */
import type { LexiconTerm } from '@/api/models';
import { getCanonicalAtomOptions, inferCanonicalAtomFromGcam } from '@/data/canonicalAtomGcamMap';
import { getPolicyArticles } from '@/data/policyMap';

export const GLOSSARY_CSV_HEADERS = [
  'canonical_atom',
  'term',
  'term_variants',
  'term_type',
  'category',
  'severity_floor',
  'enforcement_mode',
  'gcam_article_id',
  'gcam_atom_id',
  'gcam_article_title_ar',
  'description',
  'example_usage',
] as const;

function escapeCsvCell(value: string): string {
  const s = value ?? '';
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Variants in CSV: separated by | (pipe) to avoid comma issues in Arabic. */
export function joinVariants(variants: string[] | undefined | null): string {
  return (variants ?? []).filter(Boolean).join('|');
}

export function splitVariants(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

export function exportGlossaryToCsv(terms: LexiconTerm[]): string {
  const header = GLOSSARY_CSV_HEADERS.join(',');
  const rows = terms
    .filter((t) => t.is_active)
    .map((t) => {
      const canonical =
        inferCanonicalAtomFromGcam(t.gcam_article_id, t.gcam_atom_id ?? null) || '';
      const cells = [
        canonical,
        t.term,
        joinVariants(t.term_variants),
        t.term_type,
        t.category,
        String(t.severity_floor ?? '').toLowerCase(),
        t.enforcement_mode,
        String(t.gcam_article_id),
        t.gcam_atom_id ?? '',
        t.gcam_article_title_ar ?? '',
        t.description ?? '',
        t.example_usage ?? '',
      ];
      return cells.map(escapeCsvCell).join(',');
    });
  return [header, ...rows].join('\r\n');
}

function normHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

type RowMap = Record<string, string>;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export type ParsedGlossaryRow = {
  term: string;
  term_variants: string[];
  term_type: LexiconTerm['term_type'];
  category: LexiconTerm['category'];
  severity_floor: string;
  enforcement_mode: LexiconTerm['enforcement_mode'];
  gcam_article_id: number;
  gcam_atom_id: string;
  gcam_article_title_ar: string;
  description: string;
  example_usage: string;
};

export function parseGlossaryCsv(text: string): { rows: ParsedGlossaryRow[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push('CSV must have a header row and at least one data row.');
    return { rows: [], errors };
  }
  const headers = parseCsvLine(lines[0]!).map(normHeader);
  const idx = (name: string) => headers.indexOf(name);

  const iTerm = idx('term');
  if (iTerm < 0) {
    errors.push('Missing required column: term');
    return { rows: [], errors };
  }

  const iCanon = idx('canonical_atom');
  const iVariants = idx('term_variants');
  const iType = idx('term_type');
  const iCat = idx('category');
  const iSev = idx('severity_floor');
  const iMode = idx('enforcement_mode');
  const iArt = idx('gcam_article_id');
  const iAtom = idx('gcam_atom_id');
  const iTitle = idx('gcam_article_title_ar');
  const iDesc = idx('description');
  const iEx = idx('example_usage');

  const rows: ParsedGlossaryRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvLine(lines[r]!);
    const get = (i: number) => (i >= 0 && i < cells.length ? cells[i]!.trim() : '');
    const term = get(iTerm);
    if (!term) continue;

    let gcam_article_id = 1;
    let gcam_atom_id = '';
    let gcam_article_title_ar = '';

    const canon = get(iCanon).toUpperCase().replace(/\s/g, '_');
    const opts = getCanonicalAtomOptions();
    const opt = opts.find((o) => o.id === canon);
    if (opt) {
      gcam_article_id = opt.articleId;
      gcam_atom_id = opt.atomId ?? '';
      gcam_article_title_ar = getPolicyArticles().find((a) => a.articleId === opt.articleId)?.title_ar ?? '';
    } else if (iArt >= 0 && get(iArt)) {
      gcam_article_id = parseInt(get(iArt), 10) || 1;
      gcam_atom_id = get(iAtom);
      gcam_article_title_ar = get(iTitle) || getPolicyArticles().find((a) => a.articleId === gcam_article_id)?.title_ar || '';
    } else {
      errors.push(`Row ${r + 1}: set canonical_atom (e.g. INSULT) or gcam_article_id`);
      continue;
    }

    const term_variants = iVariants >= 0 ? splitVariants(get(iVariants)) : [];

    const cats = [
      'profanity',
      'sexual',
      'violence',
      'drugs',
      'gambling',
      'blasphemy',
      'discrimination',
      'misogyny',
      'humiliation',
      'threat',
      'other',
    ] as const;
    const catRaw = get(iCat).toLowerCase();
    const category = (cats.includes(catRaw as (typeof cats)[number]) ? catRaw : 'other') as LexiconTerm['category'];

    rows.push({
      term,
      term_variants,
      term_type: (['word', 'phrase', 'regex'].includes(get(iType)) ? get(iType) : 'word') as LexiconTerm['term_type'],
      category,
      severity_floor: get(iSev) || 'medium',
      enforcement_mode: (['soft_signal', 'mandatory_finding'].includes(get(iMode))
        ? get(iMode)
        : 'soft_signal') as LexiconTerm['enforcement_mode'],
      gcam_article_id,
      gcam_atom_id,
      gcam_article_title_ar,
      description: get(iDesc),
      example_usage: get(iEx),
    });
  }

  return { rows, errors };
}

/** Example row for admins (UTF-8). canonical_atom: INSULT, VIOLENCE, SEXUAL, … */
export function glossaryCsvTemplate(): string {
  const example =
    'VIOLENCE,ضرب,يضرب|تضرب|ضربا,word,violence,medium,soft_signal,,,,"",""';
  return `\uFEFF${GLOSSARY_CSV_HEADERS.join(',')}\r\n${example}\r\n`;
}
