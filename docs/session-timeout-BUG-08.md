# Session Timeout (BUG-08)

## What was fixed (app)

- **Idle timeout** (logout after no activity) now has a **minimum of 60 minutes**.
- **Settings → Session Timeout** options are **60, 120, 240, 480** minutes (15 and 30 removed).
- **Persisted settings**: if a user had a value &lt; 60, it is upgraded to 60 on load.
- **AppLayout** always uses at least 60 minutes for the idle timer.

## Supabase (project-level)

Session length is also limited by **Supabase Auth JWT expiry**:

1. In **Supabase Dashboard** go to **Authentication → Settings** (or **Project Settings → Auth**).
2. Find **JWT expiry** (or **JWT Expiry Time**). Default is often **3600** seconds (60 minutes).
3. If it is lower (e.g. 300 = 5 minutes), increase it to **≥ 3600** (60 minutes) so tokens do not expire too soon.

The app uses the Supabase client’s automatic token refresh; a very short JWT expiry can still cause 401s or repeated logouts if refresh does not run in time (e.g. tab in background). Keeping JWT expiry ≥ 60 minutes matches the app’s idle timeout and avoids BUG-08.
