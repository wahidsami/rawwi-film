-- GCAM Canonical Atom Framework + Severity Rulebook: add canonical_atom and factor columns.
-- Severity remains the single source of truth; factors are for auditability and backend calculation.

ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS canonical_atom text,
  ADD COLUMN IF NOT EXISTS intensity smallint CHECK (intensity IS NULL OR (intensity >= 1 AND intensity <= 4)),
  ADD COLUMN IF NOT EXISTS context_impact smallint CHECK (context_impact IS NULL OR (context_impact >= 1 AND context_impact <= 4)),
  ADD COLUMN IF NOT EXISTS legal_sensitivity smallint CHECK (legal_sensitivity IS NULL OR (legal_sensitivity >= 1 AND legal_sensitivity <= 4)),
  ADD COLUMN IF NOT EXISTS audience_risk smallint CHECK (audience_risk IS NULL OR (audience_risk >= 1 AND audience_risk <= 4));

COMMENT ON COLUMN analysis_findings.canonical_atom IS 'Canonical atom from GCAM Framework (e.g. INSULT, VIOLENCE). Used for severity overrides and reporting.';
COMMENT ON COLUMN analysis_findings.intensity IS 'Severity factor 1-4 (Rulebook). Strength of the violation.';
COMMENT ON COLUMN analysis_findings.context_impact IS 'Severity factor 1-4. How prominent in scene.';
COMMENT ON COLUMN analysis_findings.legal_sensitivity IS 'Severity factor 1-4. Regulatory seriousness.';
COMMENT ON COLUMN analysis_findings.audience_risk IS 'Severity factor 1-4. Risk based on audience.';

CREATE INDEX IF NOT EXISTS idx_analysis_findings_canonical_atom ON analysis_findings(canonical_atom) WHERE canonical_atom IS NOT NULL;
