-- Analysis Diff Engine (Pipeline V2.5 Research Edition)
-- Replace the two UUID placeholders below.
WITH params AS (
  SELECT
    '00000000-0000-0000-0000-000000000000'::uuid AS run_a,
    '00000000-0000-0000-0000-000000000001'::uuid AS run_b
),
stage_order AS (
  SELECT *
  FROM (VALUES
    ('pass_output', 1),
    ('canonicalization', 2),
    ('grounding', 3),
    ('validation', 4),
    ('aggregation', 5),
    ('final_report', 6)
  ) AS t(stage_name, stage_rank)
),
run_a_events AS (
  SELECT
    e.job_id,
    e.lineage_id,
    coalesce(e.canonical_hash, e.evidence_hash, e.lineage_id) AS finding_key,
    e.stage_name,
    s.stage_rank,
    e.reason_if_removed,
    e.pass_name,
    e.article_id,
    e.atom_id,
    e.start_offset,
    e.end_offset,
    e.created_at
  FROM public.analysis_finding_lineage_events e
  JOIN stage_order s ON s.stage_name = e.stage_name
  WHERE e.job_id = (SELECT run_a FROM params)
),
run_b_events AS (
  SELECT
    e.job_id,
    e.lineage_id,
    coalesce(e.canonical_hash, e.evidence_hash, e.lineage_id) AS finding_key,
    e.stage_name,
    s.stage_rank,
    e.reason_if_removed,
    e.pass_name,
    e.article_id,
    e.atom_id,
    e.start_offset,
    e.end_offset,
    e.created_at
  FROM public.analysis_finding_lineage_events e
  JOIN stage_order s ON s.stage_name = e.stage_name
  WHERE e.job_id = (SELECT run_b FROM params)
),
run_a_summary AS (
  SELECT
    finding_key,
    min(pass_name) FILTER (WHERE pass_name IS NOT NULL) AS pass_name,
    min(article_id) AS article_id,
    min(atom_id) AS atom_id,
    min(start_offset) AS start_offset,
    min(end_offset) AS end_offset,
    array_agg(
      stage_name || CASE WHEN reason_if_removed IS NOT NULL THEN ' [REMOVED: ' || reason_if_removed || ']' ELSE '' END
      ORDER BY stage_rank, created_at
    ) AS timeline
  FROM run_a_events
  GROUP BY finding_key
),
run_b_summary AS (
  SELECT
    finding_key,
    min(pass_name) FILTER (WHERE pass_name IS NOT NULL) AS pass_name,
    min(article_id) AS article_id,
    min(atom_id) AS atom_id,
    min(start_offset) AS start_offset,
    min(end_offset) AS end_offset,
    array_agg(
      stage_name || CASE WHEN reason_if_removed IS NOT NULL THEN ' [REMOVED: ' || reason_if_removed || ']' ELSE '' END
      ORDER BY stage_rank, created_at
    ) AS timeline
  FROM run_b_events
  GROUP BY finding_key
)
SELECT
  coalesce(a.finding_key, b.finding_key) AS finding_key,
  coalesce(a.pass_name, b.pass_name) AS pass_name,
  coalesce(a.article_id, b.article_id) AS article_id,
  coalesce(a.atom_id, b.atom_id) AS atom_id,
  coalesce(a.start_offset, b.start_offset) AS start_offset,
  coalesce(a.end_offset, b.end_offset) AS end_offset,
  CASE
    WHEN a.finding_key IS NOT NULL AND b.finding_key IS NULL THEN 'present_only_in_run_a'
    WHEN a.finding_key IS NULL AND b.finding_key IS NOT NULL THEN 'present_only_in_run_b'
    WHEN a.timeline IS DISTINCT FROM b.timeline THEN 'same_finding_different_timeline'
    ELSE 'same_finding_same_timeline'
  END AS diff_status,
  a.timeline AS run_a_timeline,
  b.timeline AS run_b_timeline
FROM run_a_summary a
FULL OUTER JOIN run_b_summary b
  ON a.finding_key = b.finding_key
ORDER BY diff_status, pass_name NULLS LAST, article_id NULLS LAST, atom_id NULLS LAST, finding_key;
