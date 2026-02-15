# Raawi Worker (Phase 1B)

Node + TypeScript worker that runs the Router-lite → Judge-heavy pipeline: job/chunk polling, Router + Judge (OpenAI), lexicon mandatory findings, dedupe/overlap, and aggregation into `analysis_reports`.

## Env

Copy `.env.example` to `.env` and set:

- `SUPABASE_URL` – e.g. `http://127.0.0.1:54321` for local
- `SUPABASE_SERVICE_ROLE_KEY` – from Supabase dashboard / `supabase status`
- `OPENAI_API_KEY` – required for Router/Judge
- Optional: `OPENAI_ROUTER_MODEL` (default `gpt-4.1-mini`), `OPENAI_JUDGE_MODEL` (default `gpt-4.1`), `JUDGE_TIMEOUT_MS` (120000), `POLL_INTERVAL_MS` (2000)

## Commands

From repo root:

- **Continuous polling** (1–2s between polls):
  ```bash
  pnpm worker:dev
  ```
- **Process a single job** (for debugging):
  ```bash
  pnpm worker:once --job <job_id>
  ```

From `apps/worker`:

- `pnpm worker:dev` / `pnpm worker:once --job <id>`

## Flow

1. **Poll**: `fetchNextJob()` → job with status `queued`/`running` and pending chunks; `fetchNextPendingChunk(jobId)` → earliest `pending` chunk.
2. **Claim**: `claimChunk(chunkId)` (atomic `pending` → `judging`); on first claim for job, set job `running` and `started_at`.
3. **Process chunk**: Lexicon mandatory findings → Router → Judge (full chunk + micro-windows if long) → verbatim filter → dedupe by `evidence_hash` → overlap collapse → insert into `analysis_findings` (lexicon first, then AI; skip on conflict).
4. **Progress**: Chunk → `done` (or `failed` on error); `incrementJobProgress(jobId)`.
5. **Aggregation**: When no chunks left in `pending`/`judging`, `runAggregation(jobId)`: build `summary_json` + `report_html`, upsert `analysis_reports`, set job `completed`.

## Lexicon

Reads `slang_lexicon` where `is_active = true`; refresh every 2 minutes. Matches: word (boundaries), phrase (substring), regex. Mandatory findings (`enforcement_mode = 'mandatory_finding'`) are inserted with `source = 'lexicon_mandatory'` and `evidence_hash = sha256(jobId:lexicon:article_id:term:line)`.
