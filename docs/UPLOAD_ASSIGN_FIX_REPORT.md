# Admin assign + upload fix — root cause and deliverables

## Root cause (why Invalid JWT only in isAssigning path)

1. **Gateway JWT verification**  
   The Supabase Edge gateway can enforce JWT verification **before** the request reaches our function. When `verify_jwt` is true (default), it returns `401 {"code":401,"message":"Invalid JWT"}` for expired or invalid tokens. That response is from the platform, not from our `requireAuth()`.

2. **isAssigning path**  
   The upload runs only when admin creates a script **and** sets an assignee and attaches a file. In that path we call `uploadScriptDocument()` after `addScript()`. If the session was idle or the access token expired, `getSession()` could still return a cached session with an expired token, so we were sending an expired JWT. Other flows (e.g. ScriptWorkspace import) may use a different code path or a recently refreshed session.

3. **Token retrieval**  
   We now use the app’s singleton Supabase client, get `session?.access_token` (never refresh_token or anon key), refresh once if missing, then retry once after a short delay. That makes the “isAssigning” path robust to stale sessions.

4. **Config**  
   `raawi-script-upload` must have `verify_jwt = false` in `supabase/config.toml` so the gateway does not reject the request; our function then validates the JWT in `requireAuth()`. If this config was not deployed, the gateway would still return 401 before our code runs.

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/pages/ClientDetails.tsx` | Use singleton `supabase` from `@/lib/supabaseClient`. Get token via getSession → refreshSession if missing → 200ms retry; send only `Authorization: Bearer <access_token>`. |
| `supabase/functions/_shared/auth.ts` | On 401: log Authorization header presence and length (never the token). |
| `supabase/functions/raawi-script-upload/index.ts` | Log when auth fails before returning 401. |
| `supabase/config.toml` | (Already present) `[functions.raawi-script-upload] verify_jwt = false`. |

## Verification checklist

1. **Login as Admin** → Create new script from Client page → Assign to another user → Attach DOCX → Save.  
   **Expected:** `POST .../raawi-script-upload` returns **200**; response includes `versionId`; script has `file_url` and a script_version row; assignee opens script workspace and sees document text.

2. **Admin creates script without assignee** (with or without file).  
   **Expected:** Still works.

3. **Regular user uploads from ScriptWorkspace import.**  
   **Expected:** Still works.

## Proof

- Network: `raawi-script-upload` response status **200** and body with `versionId`, `fileUrl`, `path`, `fileName`, `fileSize`, `versionNumber`.
- Console: no 401; optional DEBUG logs show upload success.
- DB: `scripts.file_url` and `script_versions` row for the script after upload.

## After fix

- `pnpm --filter web build` — run before commit.
- Commit: `fix(upload): use valid JWT for raawi-script-upload when assigning`
- Push to `origin/main`.
