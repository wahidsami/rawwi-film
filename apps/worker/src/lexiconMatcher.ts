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

const LEXICON_SEVERITY_ORDER: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function compactLexiconEvidence(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function dedupeMandatoryFindings(list: LexiconFinding[]): LexiconFinding[] {
  const byKey = new Map<string, LexiconFinding>();
  for (const finding of list) {
    const key = [
      finding.articleId,
      finding.atomId ?? "",
      finding.match.startIndex,
      finding.match.endIndex,
      compactLexiconEvidence(finding.evidence_snippet).toLowerCase(),
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, finding);
      continue;
    }
    const nextSeverity = LEXICON_SEVERITY_ORDER[String(finding.severity).toLowerCase()] ?? 0;
    const existingSeverity = LEXICON_SEVERITY_ORDER[String(existing.severity).toLowerCase()] ?? 0;
    if (nextSeverity > existingSeverity) {
      byKey.set(key, finding);
      continue;
    }
    if (nextSeverity === existingSeverity && (finding.term.term?.length ?? 0) > (existing.term.term?.length ?? 0)) {
      byKey.set(key, finding);
    }
  }
  return [...byKey.values()];
}

function dedupeSoftSignals(list: LexiconSignal[]): LexiconSignal[] {
  const byKey = new Map<string, LexiconSignal>();
  for (const signal of list) {
    const key = [
      signal.term.id,
      signal.match.startIndex,
      signal.match.endIndex,
      compactLexiconEvidence(signal.match.matchedText).toLowerCase(),
    ].join("|");
    if (!byKey.has(key)) byKey.set(key, signal);
  }
  return [...byKey.values()];
}

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

  return {
    mandatoryFindings: dedupeMandatoryFindings(mandatoryFindings),
    softSignals: dedupeSoftSignals(softSignals),
  };
}
