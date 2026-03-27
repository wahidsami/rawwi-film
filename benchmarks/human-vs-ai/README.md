# Human vs AI Scorecard Pack

This pack is for proving system quality against human-reviewed expectations on real or synthetic scripts.

## Goal
- compare AI and human judgment on the same script version
- track whether AI matches the expected ruling
- track article and pillar accuracy
- track special-note behavior
- track duplicate-card regressions

## Files
- `review-template.csv`: reviewer-filled scorecard dataset
- `../../scripts/run-human-ai-scorecard.mjs`: scorer

## Dataset columns
- `case_id`: stable identifier
- `title`: short scenario label
- `version_id`: script version to score
- `report_id`: optional direct report target
- `job_id`: optional direct job target
- `expected_ruling`: `violation`, `needs_review`, or `context_ok`
- `expected_primary_article`: main expected article id
- `expected_related_articles`: pipe-separated ids like `4|12`
- `expected_pillar`: expected pillar id like `P3_PublicOrderAndSafety`
- `expected_final_violations_min`: optional lower bound
- `expected_final_violations_max`: optional upper bound
- `expected_special_notes_min`: optional lower bound
- `expected_special_notes_max`: optional upper bound
- `duplicate_canonical_cards_expected`: usually `0`
- `reviewer_name`: optional human reviewer name
- `reviewer_confidence`: optional reviewer confidence
- `auditor_notes`: optional notes about disagreements

Use one of:
- `report_id`
- `job_id`
- `version_id`

If `HUMAN_AI_SCORECARD_FORCE_FRESH=true`, the scorer will create a fresh analysis job from `version_id`.

## Existing-report mode
Use this when the entity already ran the analysis and reviewed the result.

Required env:
```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export HUMAN_AI_SCORECARD_DATASET="benchmarks/human-vs-ai/review-template.csv"
```

Run:
```bash
npm run benchmark:human-ai
```

## Fresh-run mode
Use this when you want the script to launch a new analysis before scoring.

Additional env:
```bash
export BENCHMARK_TASKS_URL="https://YOUR_PROJECT.supabase.co/functions/v1/tasks"
export BENCHMARK_BEARER_TOKEN="USER_JWT"
export HUMAN_AI_SCORECARD_FORCE_FRESH=true
```

Run:
```bash
npm run benchmark:human-ai
```

## What the scorer reports
- strict ruling agreement
- primary article accuracy
- pillar accuracy
- related article accuracy
- full case pass rate
- duplicate-free rate
- violation precision
- violation recall
- violation F1

## Recommended workflow with the entity
1. Let the entity use the system normally.
2. For each disputed or representative case, fill one row in `review-template.csv`.
3. Re-run `npm run benchmark:human-ai`.
4. Save the output after each release.
5. Treat each disagreement as a new benchmark target.
