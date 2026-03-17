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

function canonicalArabicToken(v: string): string {
  // Remove common Arabic diacritics/tatweel, trim spaces, lowercase.
  return (v || "")
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

/**
 * Word boundary regex; fallback without lookbehind for older engines.
 */
function wordBoundaryRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "gui");
  } catch {
    return new RegExp(`(^|[^\\p{L}\\d_])${escaped}(?=[^\\p{L}\\d_]|$)`, "gui");
  }
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
        let re: RegExp;
        if (term.term_type === "word") {
          re = wordBoundaryRegex(str);
        } else {
          const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          re = new RegExp(escaped, "giu");
        }
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
          const startIndex = m.index;
          const endIndex = m.index + (m[0]?.length ?? 0);
          const { line, column } = getLineAndColumn(text, startIndex);
          results.push({ term, matchedText: m[0] ?? "", startIndex, endIndex, line, column });
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
