# Environment variables — where they live (Phase 5, no surprises)

We have **three runtimes**. Each has its own env file. Put vars in the right place so invites, worker, and frontend all work.

---

## 1) Supabase Edge Functions (invites, upload, companies, …)

**Process:** `supabase functions serve` (from repo root)

**Env file:** **`supabase/functions/.env`**

- The Supabase CLI loads this file by default when serving functions.
- To use a different file: `supabase functions serve --env-file /path/to/.env`

**Required for invites to work locally:**

| Variable | Example | Notes |
|----------|---------|--------|
| `SUPABASE_URL` | `http://127.0.0.1:54321` | Often auto-injected by CLI; set if not |
| `SUPABASE_SERVICE_ROLE_KEY` | (JWT from `supabase status`) | **Get it:** run `supabase status` → copy **"service_role key"** |
| `RESEND_API_KEY` | `re_xxxx…` | From [Resend](https://resend.com) |
| `APP_PUBLIC_URL` | `http://localhost:5173` | Base URL for set-password links in emails |

**Optional:**

| Variable | Example |
|----------|---------|
| `PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (storage URL rewrite) |
| `EMAIL_FROM` | `no-reply@unifinitylab.com` |

**Setup:**

1. `cp supabase/functions/.env.example supabase/functions/.env`
2. Run `supabase status` and paste the **service_role key** into `SUPABASE_SERVICE_ROLE_KEY`
3. Add your `RESEND_API_KEY` and set `APP_PUBLIC_URL=http://localhost:5173`

---

## 2) Worker (Node/tsx)

**Process:** e.g. `npm run dev` in `apps/worker` (or your worker start script)

**Env file:** **`apps/worker/.env`**

Worker does **not** send invite emails (the Edge Function does). So worker only needs its own vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`, `OPENAI_ROUTER_MODEL`, `OPENAI_JUDGE_MODEL`
- `JUDGE_TIMEOUT_MS`, `POLL_INTERVAL_MS`
- (any other worker-specific keys)

**Do not** put Resend or invite-related vars here unless you later add email sending in the worker.

**Setup:** Copy `apps/worker/.env.example` to `apps/worker/.env` and fill in.

---

## 3) Frontend (Vite)

**Process:** `npm run dev` in `apps/web` (or `vite build`)

**Env file:** **`apps/web/.env.local`** (or `apps/web/.env` for defaults)

**Rules:**

- Only variables prefixed with **`VITE_`** are exposed to the browser.
- **Never** put backend secrets here (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, etc.).

**For app URL (e.g. redirects):**

| Variable | Example |
|----------|---------|
| `VITE_APP_PUBLIC_URL` | `http://localhost:5173` |

**Setup:** Copy `apps/web/.env.local.example` to `apps/web/.env.local` and set `VITE_APP_PUBLIC_URL=http://localhost:5173`.

---

## Quick reference

| Runtime | Env file | Used by |
|--------|----------|--------|
| Edge Functions | `supabase/functions/.env` | `supabase functions serve` |
| Worker | `apps/worker/.env` | Worker dev/run (e.g. `npm run dev` in apps/worker) |
| Frontend | `apps/web/.env.local` | Vite dev/build in apps/web |

**Getting the local Supabase service_role key:**

```bash
supabase status
```

Copy the **"service_role key"** (JWT) into `SUPABASE_SERVICE_ROLE_KEY` in `supabase/functions/.env` (and in `apps/worker/.env` if the worker uses it).

---

## Acceptance

- **Invites:** Edge Function can read `RESEND_API_KEY` and `APP_PUBLIC_URL` from `supabase/functions/.env` and send invite emails (or log success in dev).
- **Worker:** Runs with `apps/worker/.env` only; no invite vars required.
- **Frontend:** Builds and can read `VITE_APP_PUBLIC_URL` from `apps/web/.env.local`.
