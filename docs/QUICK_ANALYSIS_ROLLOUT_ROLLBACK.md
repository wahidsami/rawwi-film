# Quick Analysis Rollout and Rollback

## Feature Flag

- Web flag: `VITE_ENABLE_QUICK_ANALYSIS`
- Default behavior: enabled when flag is not set.
- Disable immediately (kill-switch):
  - Set `VITE_ENABLE_QUICK_ANALYSIS=false`
  - Rebuild/redeploy web app

## Safe Rollout Order

1. Run database migration:
   - `supabase db push` (or your existing migration deployment flow)
2. Deploy scripts edge function:
   - `supabase functions deploy scripts`
3. Deploy web app with `VITE_ENABLE_QUICK_ANALYSIS=true`

## Fast Rollback Sequence

1. Turn off UI access:
   - Set `VITE_ENABLE_QUICK_ANALYSIS=false`
   - Redeploy web app
2. Revert function commit and redeploy:
   - `supabase functions deploy scripts`
3. Revert web commit and redeploy.

## Notes

- Migration is additive (`scripts.is_quick_analysis` + index) and safe to keep in place.
- No destructive DB rollback is required for incident response.
- Existing script analysis pipeline remains unchanged; quick analysis reuses upload/extract/tasks/reports flow.
