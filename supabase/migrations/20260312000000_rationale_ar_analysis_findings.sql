-- Store auditor "why violation" rationale on analysis_findings for display and querying.
-- Existing rationale lives in location->v3->rationale_ar; we backfill and then persist on insert.

ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS rationale_ar text;

COMMENT ON COLUMN analysis_findings.rationale_ar IS 'Auditor explanation: where in script, what it means in context, why considered violation (or needs_review/context_ok).';

-- Backfill from location jsonb where present
UPDATE analysis_findings
SET rationale_ar = (location->'v3'->>'rationale_ar')
WHERE location->'v3'->>'rationale_ar' IS NOT NULL
  AND (rationale_ar IS NULL OR rationale_ar = '');
