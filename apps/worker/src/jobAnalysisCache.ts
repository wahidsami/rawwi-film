import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScriptPageRow } from "./offsetToPage.js";

export type PromptLexiconTerm = {
  term: string;
  gcam_article_id: number;
  severity_floor: string;
  gcam_article_title_ar?: string | null;
  term_variants?: string[] | null;
  description?: string | null;
  example_usage?: string | null;
};

type CachedJobResources = {
  pageRows: ScriptPageRow[];
  promptLexiconTerms: PromptLexiconTerm[];
};

const jobResourceCache = new Map<string, Promise<CachedJobResources>>();

export async function getCachedJobResources(
  supabase: SupabaseClient,
  jobId: string,
  versionId: string
): Promise<CachedJobResources> {
  const existing = jobResourceCache.get(jobId);
  if (existing) return existing;

  const pending = (async () => {
    const [{ data: scriptPageRows }, { data: lexiconTerms }] = await Promise.all([
      supabase
        .from("script_pages")
        .select("page_number, content")
        .eq("version_id", versionId)
        .order("page_number", { ascending: true }),
      supabase
        .from("slang_lexicon")
        .select("term, gcam_article_id, severity_floor, gcam_article_title_ar, term_variants, description, example_usage")
        .eq("is_active", true),
    ]);

    return {
      pageRows: (scriptPageRows ?? []) as ScriptPageRow[],
      promptLexiconTerms: (lexiconTerms ?? []) as PromptLexiconTerm[],
    };
  })();

  jobResourceCache.set(jobId, pending);

  try {
    return await pending;
  } catch (error) {
    jobResourceCache.delete(jobId);
    throw error;
  }
}

export function clearCachedJobResources(jobId: string): void {
  jobResourceCache.delete(jobId);
}
