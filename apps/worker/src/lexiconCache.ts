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
        .select("id, term, term_type, severity_floor, enforcement_mode, gcam_article_id, gcam_atom_id, gcam_article_title_ar")
        .eq("is_active", true)
        .order("term");
      if (error) {
        logger.warn("Lexicon refresh failed", { error: error.message });
        return;
      }
      cache = (data ?? []) as LexiconTerm[];
      logger.info("Lexicon cache refreshed", { count: cache.length });
    } finally {
      isRefreshing = false;
    }
  }

  findMatches(text: string): LexiconMatch[] {
    const results: LexiconMatch[] = [];
    for (const term of cache) {
      let re: RegExp;
      if (term.term_type === "word") {
        re = wordBoundaryRegex(term.term);
      } else if (term.term_type === "phrase") {
        const escaped = term.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        re = new RegExp(escaped, "giu");
      } else {
        try {
          re = new RegExp(term.term, "gui");
        } catch {
          continue;
        }
      }
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        const startIndex = m.index;
        const endIndex = m.index + (m[0]?.length ?? 0);
        const { line, column } = getLineAndColumn(text, startIndex);
        results.push({
          term,
          matchedText: m[0] ?? "",
          startIndex,
          endIndex,
          line,
          column,
        });
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
