/**
 * GET /tasks — List analysis jobs for the current user (for progress UI).
 * Query: scriptId?, versionId?, limit? (default 20, max 100)
 * Returns: [{ id, scriptId, versionId, status, progressTotal, progressDone, progressPercent, createdAt, startedAt, completedAt, errorMessage }, ...]
 *
 * POST /tasks — Queue analysis (creates analysis_jobs + analysis_chunks).
 * Body: { versionId: string }
 * Returns: { jobId: string }
 */
// @ts-ignore
declare const Deno: any;

import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { getCorrelationId, sha256Hash, normalizeText, chunkText, htmlToText } from "../_shared/utils.ts";
import { saveScriptEditorContent } from "../_shared/scriptEditor.ts";
import { logAuditCanonical } from "../_shared/audit.ts";
import { isUserAdmin } from "../_shared/roleCheck.ts";


import {
  DEFAULT_DETERMINISTIC_CONFIG,
  PROMPT_VERSIONS,
  ROUTER_SYSTEM_MSG,
  JUDGE_SYSTEM_MSG
} from "../_shared/aiConstants.ts";

type JobRow = {
  id: string;
  script_id: string;
  version_id: string;
  status: string;
  progress_total: number;
  progress_done: number;
  progress_percent: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  script_content_hash?: string | null;
  canonical_length?: number | null;
};

function toCamel(job: JobRow) {
  return {
    id: job.id,
    scriptId: job.script_id,
    versionId: job.version_id,
    status: job.status,
    progressTotal: job.progress_total,
    progressDone: job.progress_done,
    progressPercent: job.progress_percent,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    errorMessage: job.error_message,
    scriptContentHash: job.script_content_hash ?? null,
    canonicalLength: job.canonical_length ?? null,
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const correlationId = getCorrelationId(req);
  const uid = auth.userId;
  const supabase = createSupabaseAdmin();

  // Admin bypass check (Robust DB check)
  const isAdmin = await isUserAdmin(supabase, uid);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId")?.trim() || undefined;
    const chunks = url.searchParams.get("chunks") === "true";
    const scriptId = url.searchParams.get("scriptId")?.trim() || undefined;
    const versionId = url.searchParams.get("versionId")?.trim() || undefined;
    const limitRaw = url.searchParams.get("limit");
    let limit = 20;
    if (limitRaw != null) {
      const n = parseInt(limitRaw, 10);
      if (!Number.isNaN(n)) limit = Math.min(100, Math.max(1, n));
    }



    // --- GET /tasks?jobId=...&chunks=true  → per-chunk status (debug) ---
    if (jobId && chunks) {
      // Ownership check: job must belong to this user
      const { data: ownerCheck, error: ownerErr } = await supabase
        .from("analysis_jobs")
        .select("id")
        .eq("id", jobId)
        .eq("created_by", uid)
        .maybeSingle();
      if (ownerErr || !ownerCheck) {
        if (!isAdmin) return json({ error: "Job not found or access denied" }, 404);
      }
      const { data: chunkRows, error: chunkErr } = await supabase
        .from("analysis_chunks")
        .select("chunk_index, status, last_error")
        .eq("job_id", jobId)
        .order("chunk_index", { ascending: true });
      if (chunkErr) {
        console.error(`[tasks] GET chunks correlationId=${correlationId} error=`, chunkErr.message);
        return json({ error: chunkErr.message }, 500);
      }
      return json(
        (chunkRows ?? []).map((c: any) => ({
          chunkIndex: c.chunk_index,
          status: c.status,
          lastError: c.last_error ?? null,
        }))
      );
    }

    // --- GET /tasks?jobId=...  → single job lookup ---
    if (jobId) {
      const { data: row, error: err } = await supabase
        .from("analysis_jobs")
        .select("id, script_id, version_id, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, error_message, script_content_hash")
        .eq("id", jobId)
        .eq("created_by", uid)
        .maybeSingle();
      if (err) {
        console.error(`[tasks] GET jobId=${jobId} correlationId=${correlationId} error=`, err.message);
        return json({ error: err.message }, 500);
      }
      if (!row) return json({ error: "Job not found" }, 404);
      return json(toCamel(row as JobRow));
    }

    // --- GET /tasks  → list jobs ---
    // --- GET /tasks  → list jobs AND assigned scripts ---

    // 1. Fetch Analysis Jobs
    let jobQuery = supabase
      .from("analysis_jobs")
      .select("id, script_id, version_id, status, progress_total, progress_done, progress_percent, created_at, started_at, completed_at, error_message")
      .order("created_at", { ascending: false })
      .limit(limit);

    // If NOT admin, filter by created_by
    // We check role from auth.role or metadata. 
    // Ideally we'd use a robust check, but for now let's assume if they have 'Admin' or 'Super Admin' role in metadata
    // The 'auth' object from requireAuth has 'role' if it's in JWT, but usually it's 'authenticated'. 
    // Let's check the user's role from the DB or metadata if possible.
    // For simpler logic here: we can fetch the user's role.

    // FAST CHECK: check if user is admin
    // Admin check is handled at top level


    if (!isAdmin) {
      jobQuery = jobQuery.eq("created_by", uid);
    }

    if (scriptId) jobQuery = jobQuery.eq("script_id", scriptId);
    if (versionId) jobQuery = jobQuery.eq("version_id", versionId);

    const { data: jobRows, error: jobError } = await jobQuery;
    if (jobError) {
      console.error(`[tasks] GET jobs error=`, jobError.message);
      return json({ error: jobError.message }, 500);
    }

    // 2. Fetch Assigned Scripts (Manual Tasks)
    let scriptQuery = supabase
      .from("scripts")
      .select("id, title, status, created_at, company_id, assignee_id")
      .order("created_at", { ascending: false })
      .limit(limit);

    // If NOT admin, filter by assignee_id
    if (!isAdmin) {
      scriptQuery = scriptQuery.eq("assignee_id", uid);
    } else {
      // For admin, maybe we only want to see assigned scripts? 
      // Or all scripts? "Tasks" usually implies things TO DO.
      // If Admin sees ALL scripts, it might be clutter.
      // But user asked "does the admin see all the tasks and what the users are doing?".
      // So yes, let's show all assigned scripts.
      scriptQuery = scriptQuery.not('assignee_id', 'is', null);
    }

    // Filter scripts if valid UUID provided (avoid invalid syntax for non-UUIDs)
    // Note: scripts.id is UUID.
    if (scriptId) scriptQuery = scriptQuery.eq("id", scriptId);

    const { data: scriptRows, error: scriptError } = await scriptQuery;
    if (scriptError) {
      console.error(`[tasks] GET scripts error=`, scriptError.message);
      // Don't fail entire request if just scripts fail, but log it
    }

    // 3. Map to common Task interface
    const jobs = (jobRows ?? []).map((r: any) => toCamel(r));

    const assignedTasks = (scriptRows ?? []).map((s: any) => ({
      id: s.id, // Use script ID as task ID
      scriptId: s.id,
      companyName: "Client", // simplified, or fetch company name if needed
      scriptTitle: s.title,
      status: s.status, // e.g. "Draft", "Ready"
      assignedBy: "System", // we don't have this easily without join
      assignedTo: uid,
      assignedAt: s.created_at, // use created_at as proxy
    }));

    // 4. Combine and Sort
    const allTasks = [...jobs, ...assignedTasks].sort((a, b) => {
      const dateA = new Date((a as any).createdAt || (a as any).assignedAt).getTime();
      const dateB = new Date((b as any).createdAt || (b as any).assignedAt).getTime();
      return dateB - dateA;
    });

    return json(allTasks.slice(0, limit));
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // PATCH: Ignore manual task creation (frontend legacy call)
  // If body has 'assignedTo' or ID starts with 'TSK-', it's a manual task.
  // We just return success because the script.assignee_id is the source of truth.
  if (body.assignedTo || (body.id && String(body.id).startsWith("TSK-"))) {
    return json(body); // Echo back the task
  }

  const versionId = body?.versionId;
  if (!versionId || typeof versionId !== "string" || !versionId.trim()) {
    return json({ error: "versionId is required" }, 400);
  }



  const { data: version, error: versionErr } = await supabase
    .from("script_versions")
    .select("id, script_id, extracted_text, extraction_status")
    .eq("id", versionId.trim())
    .single();

  if (versionErr || !version) {
    return json({ error: "Version not found" }, 404);
  }

  const { data: script, error: scriptErr } = await supabase
    .from("scripts")
    .select("id, created_by, assignee_id")
    .eq("id", (version as { script_id: string }).script_id)
    .single();

  if (scriptErr || !script) {
    return json({ error: "Script not found" }, 404);
  }

  const s = script as { created_by: string | null; assignee_id: string | null };
  const hasAccess =
    isAdmin || s.created_by === uid || (s.assignee_id != null && s.assignee_id === uid);
  if (!hasAccess) {
    return json({ error: "Forbidden" }, 403);
  }

  const v = version as { extracted_text: string | null; extraction_status: string };
  if (v.extraction_status !== "done") {
    return json({ error: "Extract first" }, 400);
  }
  if (v.extracted_text == null || String(v.extracted_text).trim() === "") {
    return json({ error: "Extract first" }, 400);
  }

  const scriptId = (version as { script_id: string }).script_id;
  // Use existing script_text.content as canonical; do NOT rewrite. Canonical is set at import/extract.
  const { data: scriptTextRow } = await supabase
    .from("script_text")
    .select("content, content_hash, content_html")
    .eq("version_id", versionId.trim())
    .maybeSingle();

  let normalized: string;
  let script_content_hash: string;
  const st = scriptTextRow as { content?: string | null; content_hash?: string | null; content_html?: string | null } | null;
  const existingContent = st?.content != null && String(st.content).trim() !== "";

  if (existingContent) {
    normalized = st!.content!.trim();
    const existingHash = (st!.content_hash != null && String(st!.content_hash).trim() !== "")
      ? String(st!.content_hash).trim()
      : null;
    script_content_hash = existingHash ?? await sha256Hash(normalized);
    // Backfill script_text.content_hash when missing so editor and job stay in sync for highlight check
    if (!existingHash) {
      const editorSave = await saveScriptEditorContent(
        supabase,
        versionId.trim(),
        scriptId,
        normalized,
        script_content_hash,
        (st as { content_html?: string | null }).content_html ?? undefined
      );
      if (editorSave.error) {
        console.warn(`[tasks] correlationId=${correlationId} script_text content_hash backfill failed:`, editorSave.error);
      }
    }
  } else {
    // No canonical yet: compute once from content_html or extracted_text and save (import path may have skipped script_text).
    const contentHtml = st?.content_html;
    normalized =
      contentHtml != null && contentHtml.length > 0
        ? normalizeText(htmlToText(contentHtml))
        : normalizeText(v.extracted_text);
    script_content_hash = await sha256Hash(normalized);
    const editorSave = await saveScriptEditorContent(
      supabase,
      versionId.trim(),
      scriptId,
      normalized,
      script_content_hash,
      contentHtml ?? undefined
    );
    if (editorSave.error) {
      console.warn(`[tasks] correlationId=${correlationId} script_text/sections save failed:`, editorSave.error);
    }
  }

  const canonical_length = normalized.length;
  const chunks = chunkText(normalized, 12_000, 800);
  const progress_total = chunks.length + 1;

  const { data: job, error: jobErr } = await supabase
    .from("analysis_jobs")
    .insert({
      script_id: scriptId,
      version_id: versionId.trim(),
      created_by: uid,
      status: "queued",
      progress_total,
      progress_done: 0,
      progress_percent: 0,
      normalized_text: normalized,
      script_content_hash,
      canonical_length,
      config_snapshot: {
        ...DEFAULT_DETERMINISTIC_CONFIG,
        router_prompt_version: PROMPT_VERSIONS.router,
        router_prompt_hash: await sha256Hash(ROUTER_SYSTEM_MSG),
        judge_prompt_version: PROMPT_VERSIONS.judge,
        judge_prompt_hash: await sha256Hash(JUDGE_SYSTEM_MSG),
        schema_version: PROMPT_VERSIONS.schema,
      },
    })
    .select("id")
    .single();

  if (jobErr || !job?.id) {
    console.error(`[tasks] correlationId=${correlationId} job insert error=`, jobErr?.message);
    return json({ error: jobErr?.message ?? "Failed to create analysis job" }, 500);
  }

  // Dev assertion: stored script_text.content_hash should match job hash for this version
  const { data: stCheck } = await supabase
    .from("script_text")
    .select("content_hash")
    .eq("version_id", versionId.trim())
    .maybeSingle();
  const storedHash = (stCheck as { content_hash?: string | null } | null)?.content_hash ?? null;
  if (storedHash != null && storedHash !== script_content_hash) {
    console.warn(`[tasks] correlationId=${correlationId} hash mismatch after job create: job.script_content_hash !== script_text.content_hash for version=${versionId}`);
  }
  console.log(`[tasks] job created correlationId=${correlationId} versionId=${versionId} canonical_length=${canonical_length} script_content_hash=${script_content_hash.slice(0, 16)}...`);

  const { data: scriptRow } = await supabase.from("scripts").select("title").eq("id", scriptId).maybeSingle();
  const scriptTitle = (scriptRow as { title?: string } | null)?.title ?? scriptId;
  logAuditCanonical(supabase, {
    event_type: "TASK_CREATED",
    actor_user_id: uid,
    target_type: "task",
    target_id: job.id,
    target_label: scriptTitle,
    result_status: "success",
    correlation_id: correlationId,
  }).catch((e) => console.warn("[tasks] audit log:", e));

  const chunkRows = chunks.map((c, i) => ({
    job_id: job.id,
    chunk_index: i,
    text: c.text,
    start_offset: c.start_offset,
    end_offset: c.end_offset,
    start_line: c.start_line,
    end_line: c.end_line,
    status: "pending",
  }));

  const { error: chunksErr } = await supabase.from("analysis_chunks").insert(chunkRows);
  if (chunksErr) {
    console.error(`[tasks] correlationId=${correlationId} chunks insert error=`, chunksErr.message);
    return json({ error: chunksErr.message }, 500);
  }

  return json({ jobId: job.id });
});
