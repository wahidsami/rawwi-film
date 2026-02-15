import type { SupabaseClient } from "@supabase/supabase-js";
import { getLexiconCache } from "./lexiconCache.js";
import type { LexiconMatch } from "./lexiconCache.js";

export type LexiconFinding = {
  term: LexiconMatch["term"];
  match: LexiconMatch;
  articleId: number;
  atomId: string | null;
  articleTitleAr: string | null;
  severity: string;
  isMandatory: true;
  evidence_snippet: string;
  line_start: number;
  line_end: number;
};

export type LexiconSignal = {
  term: LexiconMatch["term"];
  match: LexiconMatch;
  suggestedSeverity: string;
};

export type LexiconAnalysisResult = {
  mandatoryFindings: LexiconFinding[];
  softSignals: LexiconSignal[];
};

/**
 * Analyze chunk text against lexicon; split into mandatory findings and soft signals.
 */
export function analyzeLexiconMatches(
  text: string,
  supabase: SupabaseClient
): LexiconAnalysisResult {
  const cache = getLexiconCache(supabase);
  const matches = cache.findMatches(text);
  const mandatoryFindings: LexiconFinding[] = [];
  const softSignals: LexiconSignal[] = [];

  for (const match of matches) {
    const t = match.term;
    if (t.enforcement_mode === "mandatory_finding") {
      mandatoryFindings.push({
        term: t,
        match,
        articleId: t.gcam_article_id,
        atomId: t.gcam_atom_id ?? null,
        articleTitleAr: t.gcam_article_title_ar ?? null,
        severity: t.severity_floor,
        isMandatory: true,
        evidence_snippet: match.matchedText,
        line_start: match.line,
        line_end: match.line,
      });
    } else {
      softSignals.push({
        term: t,
        match,
        suggestedSeverity: t.severity_floor,
      });
    }
  }

  return { mandatoryFindings, softSignals };
}
