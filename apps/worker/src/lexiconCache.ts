import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";
import { logger } from "./logger.js";

export type LexiconTerm = {
  id: string;
  term: string;
  term_type: "word" | "phrase" | "regex";
  severity_floor: string;
  enforcement_mode: "soft_signal" | "mandatory_finding";
  gcam_article_id: number;
  gcam_atom_id: string | null;
  gcam_article_title_ar: string | null;
  /** Conjugations/forms (e.g. يضرب، تضرب for ضرب). All are matched like the main term. */
  term_variants?: string[] | null;
};

export type LexiconMatch = {
  term: LexiconTerm;
  matchedText: string;
  startIndex: number;
  endIndex: number;
  line: number;
  column: number;
};

let cache: LexiconTerm[] = [];
let isRefreshing = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
const ARABIC_NON_SIGNAL_WORDS = new Set<string>(["ال"]);
const ARABIC_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u;
const ARABIC_LETTER_RE = /[\u0621-\u064A\u066E-\u066F\u0671-\u06D3\u06FA-\u06FC\u06FF]/u;
const ARABIC_DIACRITICS_RE = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ARABIC_OBFUSCATION_RE = /[\u0640\u200B-\u200F\u2060\uFEFF]/g;
const FLEXIBLE_ARABIC_GAP = String.raw`(?:[\s\u00A0\u0610-\u061A\u0640\u064B-\u065F\u0670\u06D6-\u06ED\u200B-\u200F\u2060\uFEFF.,،;:!?\-_\/\\|~*]*)`;

function escapeRegex(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasArabicChars(v: string): boolean {
  return ARABIC_CHAR_RE.test(v);
}

function isArabicLetter(ch: string): boolean {
  return ARABIC_LETTER_RE.test(ch);
}

/**
 * Detection-only normalization for Arabic terms.
 * Keeps the original text untouched for evidence/offset display.
 */
export function canonicalArabicToken(v: string): string {
  return (v || "")
    .normalize("NFC")
    .replace(ARABIC_DIACRITICS_RE, "")
    .replace(ARABIC_OBFUSCATION_RE, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function arabicCharPattern(ch: string): string {
  const normalized = canonicalArabicToken(ch);
  if (!normalized) return "";
  if (normalized === "ا") return "[اأإآٱ]";
  if (normalized === "ي") return "[يى]";
  return escapeRegex(normalized);
}

function buildFlexibleArabicBody(term: string): string {
  const normalized = canonicalArabicToken(term);
  if (!normalized) return "";
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens
    .map((token) => [...token].map(arabicCharPattern).filter(Boolean).join(FLEXIBLE_ARABIC_GAP))
    .filter(Boolean)
    .join(`${FLEXIBLE_ARABIC_GAP}+`);
}

export function findStringMatches(
  text: string,
  rawNeedle: string,
  termType: "word" | "phrase"
): Array<Omit<LexiconMatch, "term">> {
  const needle = rawNeedle.trim();
  if (!needle) return [];

  const useFlexibleArabic = hasArabicChars(needle);
  const results: Array<Omit<LexiconMatch, "term">> = [];

  let regex: RegExp;
  let captureGroup = 1;

  if (useFlexibleArabic) {
    const body = buildFlexibleArabicBody(needle);
    if (!body) return [];
    if (termType === "word") {
      regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${body})(?=[^\\p{L}\\p{N}_]|$)`, "gu");
      captureGroup = 2;
    } else {
      regex = new RegExp(`(${body})`, "gu");
    }
  } else {
    const escaped = escapeRegex(needle);
    if (termType === "word") {
      regex = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?=[^\\p{L}\\p{N}_]|$)`, "giu");
      captureGroup = 2;
    } else {
      regex = new RegExp(`(${escaped})`, "giu");
    }
  }

  let m: RegExpExecArray | null;
  regex.lastIndex = 0;
  while ((m = regex.exec(text)) !== null) {
    const matchedText = m[captureGroup] ?? "";
    if (!matchedText) continue;
    const startIndex = m.index + (captureGroup === 2 ? (m[1]?.length ?? 0) : 0);
    const endIndex = startIndex + matchedText.length;
    const { line, column } = getLineAndColumn(text, startIndex);
    results.push({ matchedText, startIndex, endIndex, line, column });
  }

  return results;
}

function shouldSkipStandaloneWordTerm(term: LexiconTerm): boolean {
  if (term.term_type !== "word") return false;
  const normalized = canonicalArabicToken(term.term);
  return ARABIC_NON_SIGNAL_WORDS.has(normalized);
}

function getLineAndColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const column = (lines[lines.length - 1] ?? "").length + 1;
  return { line, column };
}

export class LexiconCache {
  constructor(private supabase: SupabaseClient) { }

  async refresh(): Promise<void> {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      const { data, error } = await this.supabase
        .from("slang_lexicon")
        .select("id, term, term_type, severity_floor, enforcement_mode, gcam_article_id, gcam_atom_id, gcam_article_title_ar, term_variants, updated_at")
        .eq("is_active", true)
        .order("term");
      if (error) {
        logger.warn("Lexicon refresh failed", { error: error.message, code: error.code, hint: error.hint });
        return;
      }
      const rows = (data ?? []) as (LexiconTerm & { updated_at?: string })[];
      cache = rows.map(({ updated_at: _, ...r }) => r);
      const maxUpdatedAt = rows.length
        ? rows.reduce((max, r) => (r.updated_at && (!max || r.updated_at > max) ? r.updated_at : max), "")
        : null;
      const firstTerms = cache.slice(0, 3).map((t) => t.term);
      logger.info("Lexicon cache refreshed", {
        count: cache.length,
        updated_at_max: maxUpdatedAt ?? undefined,
        first_terms: firstTerms.length ? firstTerms : undefined,
      });
    } finally {
      isRefreshing = false;
    }
  }

  getCount(): number {
    return cache.length;
  }

  findMatches(text: string): LexiconMatch[] {
    const results: LexiconMatch[] = [];
    const stringsToMatch = (t: typeof cache[0]) => [t.term, ...(t.term_variants ?? [])].filter((s) => s && s.trim().length > 0);
    for (const term of cache) {
      if (shouldSkipStandaloneWordTerm(term)) continue;
      if (term.term_type === "regex") {
        try {
          const re = new RegExp(term.term, "gui");
          let m: RegExpExecArray | null;
          re.lastIndex = 0;
          while ((m = re.exec(text)) !== null) {
            const startIndex = m.index;
            const endIndex = m.index + (m[0]?.length ?? 0);
            const { line, column } = getLineAndColumn(text, startIndex);
            results.push({ term, matchedText: m[0] ?? "", startIndex, endIndex, line, column });
          }
        } catch {
          /* skip invalid regex */
        }
        continue;
      }
      for (const str of stringsToMatch(term)) {
        const matches = findStringMatches(text, str, term.term_type);
        for (const match of matches) {
          const before = match.startIndex > 0 ? text[match.startIndex - 1] ?? "" : "";
          const after = match.endIndex < text.length ? text[match.endIndex] ?? "" : "";
          if (
            term.term_type === "word" &&
            ((before && isArabicLetter(before)) || (after && isArabicLetter(after)))
          ) {
            continue;
          }
          results.push({
            term,
            matchedText: match.matchedText,
            startIndex: match.startIndex,
            endIndex: match.endIndex,
            line: match.line,
            column: match.column,
          });
        }
      }
    }
    return results;
  }

  startAutoRefresh(): void {
    if (refreshTimer) return;
    refreshTimer = setInterval(() => this.refresh(), config.LEXICON_REFRESH_MS);
    logger.info("Lexicon auto-refresh started", { intervalMs: config.LEXICON_REFRESH_MS });
  }

  stopAutoRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
}

let instance: LexiconCache | null = null;

export function getLexiconCache(supabase: SupabaseClient): LexiconCache {
  if (!instance) instance = new LexiconCache(supabase);
  return instance;
}

export async function initializeLexiconCache(supabase: SupabaseClient): Promise<void> {
  const c = getLexiconCache(supabase);
  await c.refresh();
  c.startAutoRefresh();
}
