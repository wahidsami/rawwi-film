# Phase 1A – Manual test steps and expected DB state

## Prerequisites

- Supabase local: `supabase start` (or use hosted project).
- Migrations applied: `supabase db reset` or `supabase migration up`.
- Edge Functions served: `supabase functions serve`.
- **Web auth**: In `apps/web/.env.local` set `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY` to the anon (publishable) key from `supabase start` output. Use the same URL for Auth token grant; wrong URL (e.g. kong:8000) causes 400. Sign up or sign in with a real password (no mock).
- **Upload (signed URL)**: Edge Functions need `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` so the upload function can rewrite the signed URL for the browser. Set in project root `.env` when running `supabase functions serve`, or in Supabase Dashboard for hosted.
- Valid JWT: sign in via frontend or Auth API and copy the access token.
- At least one **client** (company) in DB; use its `id` as `companyId` for scripts (e.g. from Dashboard or `INSERT INTO clients ...`).

Set in your shell:

```bash
TOKEN="YOUR_ACCESS_TOKEN"
BASE="http://127.0.0.1:54321/functions/v1"
```

---

## 1. Create script (POST /scripts)

**Request:**

```bash
# Replace CLIENT_UUID with a real clients.id (uuid)
curl -s -X POST "$BASE/scripts" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "companyId": "CLIENT_UUID",
    "title": "Test Script",
    "type": "Film",
    "status": "draft"
  }'
```

**Expected response (200):** Script in camelCase, e.g.:

```json
{
  "id": "<script_uuid>",
  "companyId": "<client_uuid>",
  "title": "Test Script",
  "type": "Film",
  "status": "draft",
  "createdAt": "..."
}
```

Save `id` as `SCRIPT_ID` for the next steps.

**Validation:** Missing or empty `companyId`, `title`, `type`, or `status` → 400. Invalid/unknown `companyId` → 400 (FK violation).

---

## 2. Create version (POST /scripts/versions)

**Request:**

```bash
# Use SCRIPT_ID from step 1
curl -s -X POST "$BASE/scripts/versions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "scriptId": "SCRIPT_ID",
    "source_file_name": "script.txt",
    "source_file_type": "text/plain",
    "source_file_size": 1024
  }'
```

**Optional:** If you already have a storage path (from step 3), include it so extract can download the file later:

```bash
# After you have PATH from POST /upload (step 3), you can create version with path:
# Or create version first, then in a real flow you'd PATCH the version with path after upload.
# For MVP with extract text-only, path is optional.
curl -s -X POST "$BASE/scripts/versions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"scriptId\": \"$SCRIPT_ID\",
    \"source_file_name\": \"script.txt\",
    \"source_file_path\": \"$UPLOAD_PATH\"
  }"
```

**Expected response (200):** ScriptVersion in camelCase, e.g.:

```json
{
  "id": "<version_uuid>",
  "scriptId": "<script_uuid>",
  "versionNumber": 1,
  "source_file_name": "script.txt",
  "source_file_type": "text/plain",
  "source_file_size": 1024,
  "source_file_url": null,
  "extraction_status": "pending",
  "createdAt": "..."
}
```

Save `id` as `VERSION_ID` for extract.

**Validation:** Missing `scriptId` → 400. Script not found → 404. Script not owned (created_by or assignee) → 403.

---

## 3. POST /upload (signed URL + path)

**Request:**

```bash
curl -s -X POST "$BASE/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-correlation-id: test-upload-001" \
  -d '{"fileName": "script.txt"}'
```

**Expected response (200):**

```json
{
  "url": "https://...",
  "path": "<user_id>/unscoped/<timestamp>_script.txt"
}
```

- **url**: Signed upload URL (PUT) valid for 5 minutes.
- **path**: Storage object key; store this and pass as `source_file_path` (and optionally `source_file_url`) when creating or updating a version if you want extract to download from storage instead of using request body `text`.

No DB rows are created by this call.

**Validation:** Missing or invalid `fileName` → 400. No/invalid Bearer token → 401.

---

## 4. Upload file (optional; can skip in docs)

Using the `url` from step 3, the client uploads the file with a PUT request (e.g. with fetch or curl). If you only test the extract-with-text path, you can skip this and go to step 5.

---

## 5. POST /extract (complete pipeline)

**Request (MVP – send extracted text in body):**

```bash
curl -s -X POST "$BASE/extract" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-correlation-id: test-extract-001" \
  -d "{
    \"versionId\": \"$VERSION_ID\",
    \"text\": \"مرحبا هذا نص تجريبي للتحليل. Hello world.\"
  }"
```

**Expected response (200):** ScriptVersion-shaped JSON with `extraction_status: "done"` and `extracted_text` set.

**Expected DB after successful extract:**

1. **script_versions**  
   - Row for `VERSION_ID`: `extraction_status` = `done`, `extracted_text` set, `extracted_text_hash` set.

2. **analysis_jobs**  
   - One new row: `script_id`, `version_id`, `created_by`, `status` = `queued`, `normalized_text`, `script_content_hash`, `progress_total` = chunks.length + 1, `progress_done` = 0.

3. **analysis_chunks**  
   - One row per chunk: `job_id`, `chunk_index`, `text`, `start_offset`, `end_offset`, `start_line`, `end_line`, `status` = `pending`.

**Validation:** Missing `versionId` → 400. Version not found → 404. Not owner of script → 403. Idempotency: if version is already `done` with `extracted_text`, returns current version without re-running.

---

## 6. GET /scripts (list)

**Request:**

```bash
curl -s -X GET "$BASE/scripts" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected response (200):** Array of Scripts (camelCase) visible to the user (`created_by` or `assignee_id` = auth user), ordered by `created_at` desc.

---

## 7. Optional: x-correlation-id

All responses include CORS headers. Sending `x-correlation-id` on upload and extract helps trace requests in logs.

---

## 8. Phase 1B — Worker (run after extract)

After you have a job and chunks (from step 6), run the worker to process chunks and generate the report.

1. **Env**  
   In `apps/worker`, copy `.env.example` to `.env` and set:
   - `SUPABASE_URL` (e.g. `http://127.0.0.1:54321`)
   - `SUPABASE_SERVICE_ROLE_KEY` (from `supabase status`)
   - `OPENAI_API_KEY`

2. **Process one job** (replace `<JOB_ID>` with the job id returned from extract):
   ```bash
   pnpm worker:once --job <JOB_ID>
   ```

3. **Verify**
   - `analysis_chunks`: processed chunks have `status = 'done'` (or `failed` on error).
   - `analysis_findings`: rows for that `job_id` (source `ai` or `lexicon_mandatory`).
   - `analysis_reports`: one row for that `job_id` with `summary_json` and `report_html`.
   - `analysis_jobs`: job `status = 'completed'`, `completed_at` set.

4. **Continuous mode** (optional):
   ```bash
   pnpm worker:dev
   ```
   Polls for the next job with pending chunks every 1–2s.
