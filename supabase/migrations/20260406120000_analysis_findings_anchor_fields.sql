-- Canonical visual anchoring fields for reviewer-facing finding highlights.
-- These fields let the product distinguish exact anchors from unresolved findings,
-- so the UI can prefer "unresolved" over painting the wrong text.

ALTER TABLE analysis_findings
  ADD COLUMN IF NOT EXISTS anchor_status text NULL CHECK (anchor_status IN ('exact', 'fuzzy', 'unresolved')),
  ADD COLUMN IF NOT EXISTS anchor_method text NULL,
  ADD COLUMN IF NOT EXISTS anchor_page_number int NULL,
  ADD COLUMN IF NOT EXISTS anchor_start_offset_page int NULL,
  ADD COLUMN IF NOT EXISTS anchor_end_offset_page int NULL,
  ADD COLUMN IF NOT EXISTS anchor_start_offset_global int NULL,
  ADD COLUMN IF NOT EXISTS anchor_end_offset_global int NULL,
  ADD COLUMN IF NOT EXISTS anchor_text text NULL,
  ADD COLUMN IF NOT EXISTS anchor_confidence numeric NULL,
  ADD COLUMN IF NOT EXISTS anchor_updated_at timestamptz NULL;

COMMENT ON COLUMN analysis_findings.anchor_status IS 'Canonical reviewer anchor state: exact, fuzzy, or unresolved.';
COMMENT ON COLUMN analysis_findings.anchor_method IS 'How the canonical anchor was resolved (stored_offsets, page_exact, document_exact, unresolved, ...).';
COMMENT ON COLUMN analysis_findings.anchor_page_number IS 'Viewer page number for the canonical anchor.';
COMMENT ON COLUMN analysis_findings.anchor_start_offset_page IS 'Start offset within the page content for the canonical anchor.';
COMMENT ON COLUMN analysis_findings.anchor_end_offset_page IS 'End offset exclusive within the page content for the canonical anchor.';
COMMENT ON COLUMN analysis_findings.anchor_start_offset_global IS 'Canonical global start offset for reviewer highlighting.';
COMMENT ON COLUMN analysis_findings.anchor_end_offset_global IS 'Canonical global end offset exclusive for reviewer highlighting.';
COMMENT ON COLUMN analysis_findings.anchor_text IS 'Exact text span the reviewer-facing anchor is expected to highlight.';
COMMENT ON COLUMN analysis_findings.anchor_confidence IS 'Confidence score for the canonical anchor resolution.';
COMMENT ON COLUMN analysis_findings.anchor_updated_at IS 'When the canonical anchor was last resolved.';

UPDATE analysis_findings
SET
  anchor_status = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN 'exact'
    ELSE 'unresolved'
  END,
  anchor_method = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN 'stored_offsets'
    ELSE 'unresolved'
  END,
  anchor_page_number = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN page_number
    ELSE NULL
  END,
  anchor_start_offset_page = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN start_offset_page
    ELSE NULL
  END,
  anchor_end_offset_page = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN end_offset_page
    ELSE NULL
  END,
  anchor_start_offset_global = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN start_offset_global
    ELSE NULL
  END,
  anchor_end_offset_global = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN end_offset_global
    ELSE NULL
  END,
  anchor_text = COALESCE(NULLIF(trim(evidence_snippet), ''), anchor_text),
  anchor_confidence = CASE
    WHEN start_offset_global IS NOT NULL
      AND end_offset_global IS NOT NULL
      AND end_offset_global > start_offset_global
    THEN COALESCE(anchor_confidence, 1)
    ELSE COALESCE(anchor_confidence, 0)
  END,
  anchor_updated_at = COALESCE(anchor_updated_at, now())
WHERE anchor_status IS NULL;
