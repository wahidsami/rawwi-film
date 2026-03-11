# Saudi Golden Script Set (Phase 1)

This folder contains a practical QA set to benchmark Hybrid V3 against Saudi-context moderation expectations.

## Contents
- `matrix.csv`: expected pillar/article/ruling per case
- `scripts/caseXX_*.txt`: individual upload-ready script samples

## How to run
1. Upload each `scripts/*.txt` in analysis.
2. Record:
   - total findings
   - top findings
   - canonical finding behavior
   - primary/related article mapping
3. Compare with `matrix.csv` expected outcomes.

## Notes
- These are synthetic QA scenarios for internal evaluation.
- They are intentionally short, to isolate decision quality (context vs keyword).
