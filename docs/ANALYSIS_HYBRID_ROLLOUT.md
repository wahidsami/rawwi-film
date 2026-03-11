# Hybrid V3 Rollout Guide

## Runtime Flags
- `ANALYSIS_ENGINE=v2|hybrid`
- `ANALYSIS_HYBRID_MODE=shadow|enforce`
- `ANALYSIS_EVAL_LOG=true|false`

## Modes
- `v2`: current production behavior.
- `hybrid + shadow`: run context arbiter and policy reasoner, persist baseline findings, log comparisons.
- `hybrid + enforce`: persist hybrid decisions as final findings.

## Shadow KPIs
Read from `analysis_engine_evaluations`:
- `baseline_contradictions`
- `baseline_severe_disagreements`
- `hybrid_context_ok`
- `hybrid_needs_review`
- `hybrid_violation`

## Suggested Graduation Criteria
1. At least 200 scripts in shadow mode.
2. Reduction in severe disagreement groups by >= 30%.
3. Human override rate drops by >= 20%.
4. No regression in high-severity true-positive recall (manual audit set).

## Activation Sequence
1. Deploy DB migration + worker changes.
2. Start with `ANALYSIS_ENGINE=hybrid` and `ANALYSIS_HYBRID_MODE=shadow`.
3. Review metrics and sampled reports weekly.
4. Switch selected tenants to `enforce`.
5. Promote global `enforce` after acceptance threshold.
