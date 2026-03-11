# Auditor Calibration Gate (Saudi)

This guide operationalizes Phase 5 for promotion from `hybrid/shadow` to `hybrid/enforce`.

## Inputs
- Golden scripts: `docs/golden-saudi-scripts/scripts/`
- Expected matrix: `docs/golden-saudi-scripts/matrix.csv`
- Actual capture sheet: `docs/golden-saudi-scripts/results-template.csv`

## Mismatch Classes
- `mention_vs_endorsement`: mention/condemnation was treated as direct violation.
- `duplicate_legal_mapping`: same canonical evidence rendered multiple times.
- `primary_article_wrong`: related article selected as primary.
- `ruling_wrong`: wrong `violation | needs_review | context_ok`.
- `rationale_weak`: auditor rationale is generic or non-legal.

## Promotion Thresholds (2 consecutive runs)
- Duplicate canonical cards per same evidence: `0`
- Primary article correctness: `>= 90%`
- Final ruling correctness: `>= 85%`
- Auditor rationale acceptance by reviewers: `>= 80%`

## SQL Pack (Supabase)

```sql
-- 1) Shadow run summary by day/mode
select
  date_trunc('day', created_at) as day,
  mode,
  count(*) as chunk_runs,
  avg(baseline_count) as avg_baseline_count,
  avg(hybrid_count) as avg_hybrid_count,
  avg(hybrid_context_ok) as avg_context_ok,
  avg(hybrid_needs_review) as avg_needs_review,
  avg(hybrid_violation) as avg_violation
from analysis_engine_evaluations
group by 1,2
order by 1 desc, 2;

-- 2) Duplicate canonical IDs within a report
select
  ar.id as report_id,
  cf->>'canonical_finding_id' as canonical_id,
  count(*) as dup_count
from analysis_reports ar,
  jsonb_array_elements(coalesce(ar.summary_json->'canonical_findings', '[]'::jsonb)) as cf
group by 1,2
having count(*) > 1
order by dup_count desc;

-- 3) Ruling distribution from canonical payload
select
  coalesce(cf->>'final_ruling', 'missing') as final_ruling,
  count(*) as n
from analysis_reports ar,
  jsonb_array_elements(coalesce(ar.summary_json->'canonical_findings', '[]'::jsonb)) as cf
group by 1
order by 2 desc;
```

## Execution Steps
1. Keep worker on `ANALYSIS_ENGINE=hybrid`, `ANALYSIS_HYBRID_MODE=shadow`.
2. Run all 20 cases (combined + per-case).
3. Fill `results-template.csv` with actual outputs.
4. Classify each mismatch using the classes above.
5. Tune prompts/rules for top 2 mismatch classes only.
6. Re-run and compare against thresholds.
7. Move to `enforce` only after two consecutive passes.
