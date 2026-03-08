# Analysis Rollout and Rollback Runbook

## Purpose
Use this runbook to deploy analysis updates safely and recover quickly if production behavior regresses.

## Current Release Chain (latest first)
- `c920381` UI: pass tracker in analysis popup
- `b98a46d` worker: deterministic must-catch insult fallback
- `a52dd98` worker: evidence snippet preference + insults prompt tuning
- `acfd5e9` worker: evidence clipping for report readability
- `af28be7` worker: partial salvage for mixed-quality pass outputs
- `5b8b428` worker: numeric-string coercion
- `ff3058c` worker: nullable field tolerance
- `02d9ae7` worker/tasks: force-fresh analysis path

## Deployment Order (strict)
1. Push `main` to GitHub.
2. Deploy Supabase function:
   - `npx supabase functions deploy tasks --project-ref swbobhxyluupjzsxpzrd`
3. Redeploy worker service in Coolify.
4. Redeploy web service in Coolify.

## Checkpoints (must pass before next step)

### Checkpoint A: tasks function deployed
- Supabase deploy output shows `Deployed Functions ...: tasks`.
- New jobs contain updated `config_snapshot` keys (schema/prompt versions and `force_fresh` when set).

### Checkpoint B: worker healthy
- Worker starts with no boot errors.
- Logs show per-chunk multipass run:
  - `totalPasses: 10`
  - per-pass breakdown entries
- No fatal parser drops for nullable/string fields.

### Checkpoint C: analysis behavior
- Run known script with expected insults and disclosure signals.
- Verify:
  - findings inserted (`attempted` ~= `inserted`)
  - must-catch insult terms detected
  - evidence snippets are short/readable (not whole-script blocks)

### Checkpoint D: UI behavior
- Analysis popup shows:
  - chunk progress `done/total`
  - active scanner label and full pass list.

## Runtime Verification Queries

```sql
-- Recent job health
select id, status, progress_done, progress_total, created_at
from analysis_jobs
order by created_at desc
limit 5;
```

```sql
-- Findings inserted per recent job
select job_id, count(*) as findings_count
from analysis_findings
group by job_id
order by max(created_at) desc
limit 5;
```

```sql
-- Must-catch terms appearing in findings evidence
select job_id, article_id, severity, evidence_snippet
from analysis_findings
where evidence_snippet ilike '%نصاب%'
   or evidence_snippet ilike '%حرامي%'
   or evidence_snippet ilike '%كذاب%'
order by created_at desc
limit 20;
```

## Rollback Strategy

### Fast rollback (service-level)
If only worker behavior regresses:
1. Roll back worker in Coolify to last healthy deployment.
2. Keep web/tasks unchanged.

If UI regresses:
1. Roll back web service only.
2. Keep worker/tasks unchanged.

### Git rollback (source-of-truth)
Revert one or more commits and redeploy in normal order.

```bash
git revert <bad_commit_sha>
git push origin main
```

For multiple contiguous commits:

```bash
git revert <newest_sha>^..<oldest_sha>
git push origin main
```

Then deploy:
1. `tasks` function
2. worker
3. web

## Rollback Acceptance Criteria
- Job creation works.
- Worker processes chunks to completion.
- Reports render without malformed evidence.
- Findings count returns to last known-good baseline for test scripts.

## Notes
- Ignore local file `supabase/.temp/gotrue-version` (tooling artifact).
- Nginx access logs are not analysis diagnostics; rely on worker logs for detection behavior.
