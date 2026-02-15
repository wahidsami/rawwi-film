/**
 * Phase 1A: Extract text + update version + create analysis job & chunks.
 * POST /extract body: { versionId: string, text?: string }
 * Returns ScriptVersion shape (frontend-models.md)
 */
import { jsonResponse, optionsResponse } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/auth.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import {
  getCorrelationId,
  sha256Hash,
  normalizeText,
  chunkText,
  htmlToText,
} from "../_shared/utils.ts";
import { saveScriptEditorContent } from "../_shared/scriptEditor.ts";
import {
  DEFAULT_DETERMINISTIC_CONFIG,
  PROMPT_VERSIONS,
  ROUTER_SYSTEM_MSG,
  JUDGE_SYSTEM_MSG
} from "../_shared/aiConstants.ts";

const BUCKET = "uploads";

type ScriptVersionRow = {
  id: string;
  script_id: string;
  version_number: number;
  source_file_name: string | null;
  source_file_type: string | null;
  source_file_size: number | null;
  source_file_path: string | null;
  source_file_url: string | null;
  extracted_text: string | null;
  extraction_status: string;
  extracted_text_hash: string | null;
  created_at: string;
};

function toFrontendVersion(row: ScriptVersionRow) {
  return {
    id: row.id,
    scriptId: row.script_id,
    versionNumber: row.version_number,
    source_file_name: row.source_file_name ?? undefined,
    source_file_type: row.source_file_type ?? undefined,
    source_file_size: row.source_file_size ?? undefined,
    source_file_url: row.source_file_url ?? undefined,
    extracted_text: row.extracted_text ?? undefined,
    extraction_status: row.extraction_status,
    createdAt: row.created_at,
  };
}

async function runIngest(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  versionId: string,
  scriptId: string,
  normalized: string,
  contentHash: string,
  userId: string,
  correlationId: string
): Promise<{ jobId: string } | { error: string }> {
  const chunks = chunkText(normalized);
  const progressTotal = chunks.length + 1;
  const progressPercent = 0;

  const { data: job, error: jobErr } = await supabase
    .from("analysis_jobs")
    .insert({
      script_id: scriptId,
      version_id: versionId,
      created_by: userId,
      status: "queued",
      progress_total: progressTotal,
      progress_done: 0,
      progress_percent: progressPercent,
      normalized_text: normalized,
      script_content_hash: contentHash,
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
    console.error(`[extract] correlationId=${correlationId} job insert error=`, jobErr?.message);
    return { error: jobErr?.message || "Failed to create analysis job" };
  }

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
    console.error(`[extract] correlationId=${correlationId} chunks insert error=`, chunksErr.message);
    return { error: chunksErr.message };
  }

  return { jobId: job.id };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? undefined;
  const json = (body: unknown, status = 200) => jsonResponse(body, status, { origin });
  if (req.method === "OPTIONS") return optionsResponse(req);

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;

  const correlationId = getCorrelationId(req);

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { versionId?: string; text?: string; contentHtml?: string | null; enqueueAnalysis?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  // Only enqueue analysis when explicitly requested (e.g. "Start Smart Analysis"). Import must not trigger analysis.
  const enqueueAnalysis = body.enqueueAnalysis === true;
  const contentHtml = body.contentHtml != null && typeof body.contentHtml === "string" ? body.contentHtml.trim() || null : null;

  const versionId = body?.versionId;
  if (!versionId || typeof versionId !== "string") {
    return json({ error: "versionId is required" }, 400);
  }

  const supabase = createSupabaseAdmin();
  const { data: version, error: versionErr } = await supabase
    .from("script_versions")
    .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at")
    .eq("id", versionId)
    .single();

  if (versionErr || !version) {
    return json({ error: "Version not found" }, 404);
  }

  const v = version as ScriptVersionRow;
  const { data: script } = await supabase.from("scripts").select("id, created_by").eq("id", v.script_id).single();
  if (!script || (script as { created_by: string | null }).created_by !== auth.userId) {
    return json({ error: "Forbidden" }, 403);
  }

  if (v.extraction_status === "done" && v.extracted_text) {
    return json(toFrontendVersion(v));
  }

  let extractedText: string;

  if (body.text != null && typeof body.text === "string") {
    extractedText = body.text.trim();
  } else {
    const objectPath = v.source_file_path;
    if (!objectPath) {
      await supabase
        .from("script_versions")
        .update({ extraction_status: "failed" })
        .eq("id", versionId);
      return json({ error: "No source file path on version" }, 400);
    }
    const { data: blob, error: downloadErr } = await supabase.storage.from("scripts").download(objectPath);
    if (downloadErr || !blob) {
      await supabase
        .from("script_versions")
        .update({ extraction_status: "failed" })
        .eq("id", versionId);
      return json({ error: downloadErr?.message || "Failed to download file" }, 500);
    }
    const ext = (v.source_file_name || "").toLowerCase().split(".").pop() || "";
    if (ext === "txt") {
      extractedText = await blob.text();
    } else if (ext === "docx") {
      return json({
        error: "DOCX extraction not available in Edge; send extracted text in request body (text field)",
      }, 501);
    } else if (ext === "pdf") {
      return json({
        error: "PDF extraction not available in Edge runtime; use worker or send pre-extracted text",
      }, 501);
    } else {
      extractedText = await blob.text();
    }
  }

  await supabase
    .from("script_versions")
    .update({ extraction_status: "extracting" })
    .eq("id", versionId);

  // Strategy A: when contentHtml is provided (e.g. DOCX), derive canonical plain text from HTML
  // so offsets match the formatted viewer DOM. Otherwise use extracted text.
  const normalized =
    contentHtml != null && contentHtml.length > 0
      ? normalizeText(htmlToText(contentHtml))
      : normalizeText(extractedText);
  const contentHash = await sha256Hash(normalized);
  const extractedTextHash = await sha256Hash(extractedText);

  const { error: updateErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: extractedText,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
    })
    .eq("id", versionId);

  if (updateErr) {
    return json({ error: updateErr.message }, 500);
  }

  const editorSave = await saveScriptEditorContent(
    supabase,
    versionId,
    v.script_id,
    normalized,
    contentHash,
    contentHtml
  );
  if (editorSave.error) {
    console.warn(`[extract] correlationId=${correlationId} script_text/sections save failed:`, editorSave.error);
  }

  if (enqueueAnalysis) {
    const ingest = await runIngest(
      supabase,
      versionId,
      v.script_id,
      normalized,
      contentHash,
      auth.userId,
      correlationId
    );
    if ("error" in ingest) {
      return json({ error: ingest.error }, 500);
    }
  }

  const { data: updated } = await supabase
    .from("script_versions")
    .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at")
    .eq("id", versionId)
    .single();

  return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
});
