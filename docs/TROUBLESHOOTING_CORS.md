# Why you see “CORS policy: No 'Access-Control-Allow-Origin' header” on Access Control

## What’s going on

When you open **Access Control**, the app calls:

- **GET** `http://127.0.0.1:54321/functions/v1/users`

The browser first sends a **preflight OPTIONS** request to that URL. For the page to work, the **response to that OPTIONS request** must include:

- `Access-Control-Allow-Origin: *` (or your origin)

Your **users** Edge Function code does send that header when it handles OPTIONS. So the CORS error usually means: **the response the browser got was not from your Edge Function**.

In practice, that happens when **Edge Functions are not running** locally.

## How local Supabase works

1. **`supabase start`**  
   Starts Supabase (Kong, Postgres, Auth, etc.) on port **54321**.  
   Kong receives requests to `http://127.0.0.1:54321/functions/v1/*`.

2. **`supabase functions serve`**  
   Starts the **Edge Functions** server. Kong forwards `/functions/v1/*` to this server.  
   Your code (e.g. `users`, `invites`) runs here and returns CORS headers.

If you **don’t** run `supabase functions serve`:

- Requests to `http://127.0.0.1:54321/functions/v1/users` are still sent to Kong.
- Kong tries to forward them to the “functions” service.
- That service isn’t running → Kong returns an error (e.g. **502 Bad Gateway** or connection failure).
- **That error response does not include CORS headers.**
- The browser then reports: *“Response to preflight request doesn’t pass access control check: No 'Access-Control-Allow-Origin' header.”*

So the problem is not that your function “doesn’t set CORS” — it’s that the response is coming from Kong/network error, not from your function.

**Another cause:** Even when Edge Functions are running, the **preflight OPTIONS** request often has **no `Authorization` header**. If the Edge Runtime verifies JWT before invoking your function, it returns **401** (or similar) for OPTIONS — and that response usually has **no CORS headers**, so the browser blocks. The fix is to run with **JWT verification disabled** so OPTIONS reaches your code; your functions still enforce auth inside (e.g. `requireAuth()`).

## Fix 1: Run Edge Functions with JWT verification disabled (required for CORS from browser)

Use **one** of these:

**Option A – Use the project start script (recommended)**

From the **project root**:

```powershell
.\start-all.ps1
```

This starts Supabase (if needed), then opens a **Edge Functions** window that runs `supabase functions serve --no-verify-jwt`. That way OPTIONS preflight is handled by your code and CORS headers are returned.

**Option B – Start Edge Functions manually**

In a **separate terminal**, from the **project root**:

```bash
supabase functions serve --no-verify-jwt
```

Leave it running. **Do not** use `supabase functions serve` without `--no-verify-jwt` when calling the API from the browser at `http://localhost:5173`, or preflight will fail with “No 'Access-Control-Allow-Origin' header”.

**Option C – Config (if your setup uses it)**

The project has `supabase/config.toml` with `verify_jwt = false` for each function. If your CLI uses that when serving, you can run `supabase functions serve` without the flag. If CORS still fails, use Option A or B.

Make sure Supabase is up as well:

```bash
supabase start
```

So in total you want:

1. `supabase start` (once)
2. `supabase functions serve --no-verify-jwt` (or run `.\start-all.ps1` which does this)
3. Your frontend at **http://localhost:5173** (and `VITE_API_BASE_URL` / `VITE_SUPABASE_URL` using **localhost**, not 127.0.0.1)

## Fix 2: Use the mock API (no backend, no CORS)

If you don’t need the real Edge Functions for now (e.g. you’re only working on the UI):

1. In **`apps/web/.env.local`** set:
   ```env
   VITE_USE_MOCK_API=true
   ```
2. Restart the Vite dev server.

The app will use the in-memory mock instead of `http://127.0.0.1:54321/functions/v1`. No cross-origin request, so no CORS. Access Control will show mock users.

## Summary

| Situation | Result |
|-----------|--------|
| `supabase functions serve` **not** running | Requests to `/functions/v1/*` fail at Kong → error response without CORS → browser shows “No Access-Control-Allow-Origin” |
| `supabase functions serve` **without** `--no-verify-jwt` | Preflight OPTIONS has no JWT → runtime returns 401 before your code → no CORS on that response → browser blocks |
| `supabase functions serve --no-verify-jwt` **running** | OPTIONS and GET hit your Edge Function → it returns CORS → reports, users, etc. work from browser |
| `VITE_USE_MOCK_API=true` | No request to 54321 → no CORS → app works with mock data only |

So: **the CORS message is explained by the preflight response not including CORS headers** — either because the function isn’t running or because JWT verification rejects OPTIONS before your code runs. Use **`supabase functions serve --no-verify-jwt`** (or `.\start-all.ps1`) when calling the API from the browser, or use the mock when you don’t need the backend.
