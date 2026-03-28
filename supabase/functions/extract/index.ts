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
  chunkTextByScriptPages,
  htmlToText,
  stripInvalidUnicodeForDb,
} from "../_shared/utils.ts";
import { saveScriptEditorContent } from "../_shared/scriptEditor.ts";
import { isSuperAdminOrAdmin } from "../_shared/roleCheck.ts";
import {
  DEFAULT_DETERMINISTIC_CONFIG,
  PROMPT_VERSIONS,
  ROUTER_SYSTEM_MSG,
  JUDGE_SYSTEM_MSG
} from "../_shared/aiConstants.ts";
import { offsetRangeToPageMinMax, type ScriptPageRow } from "../_shared/offsetToPage.ts";
import {
  sanitizePageText,
  computePageGlobalOffsets,
  extractDocxPageTexts,
} from "../_shared/serverExtract.ts";
import { insertAuditEventMinimal } from "../_shared/auditInsertMinimal.ts";

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

/** Strip accidental `scripts/` or `uploads/` prefix; object key is path within bucket. */
function normalizeStorageObjectPath(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(?:scripts|uploads)\/(.+)$/i);
  return (m ? m[1]! : t).replace(/^\//, "");
}

/**
 * Signed URL flow historically used `uploads`; raawi + current signed upload use `scripts`.
 * Try both so legacy rows and Arabic/Unicode names still resolve.
 */
async function downloadScriptFileForExtract(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  objectPath: string,
): Promise<{ blob: Blob } | { error: string }> {
  const path = normalizeStorageObjectPath(objectPath);
  const buckets = ["scripts", "uploads"] as const;
  let lastMsg = "Object not found";
  for (const bucket of buckets) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (!error && data) return { blob: data };
    if (error?.message) lastMsg = error.message;
  }
  return { error: lastMsg };
}

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
  // Whole-string clean + chunk boundary snapping (utils.chunkText) avoids Postgres
  // "unsupported Unicode escape sequence" on jsonb inserts (lone surrogates / split pairs).
  const safeNormalized = stripInvalidUnicodeForDb(normalized);
  const { data: spForChunk } = await supabase
    .from("script_pages")
    .select("page_number, content")
    .eq("version_id", versionId)
    .order("page_number", { ascending: true });
  const pr = (spForChunk ?? []) as ScriptPageRow[];
  // @ts-ignore Deno.env
  const usePageChunks =
    typeof Deno !== "undefined" &&
    (Deno.env.get("ANALYSIS_CHUNK_BY_PAGE") ?? "").toLowerCase() === "true" &&
    pr.length > 0;
  const chunks = usePageChunks
    ? chunkTextByScriptPages(safeNormalized, pr, 12_000)
    : chunkText(safeNormalized);
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
      normalized_text: safeNormalized,
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

  const pageRows: ScriptPageRow[] = pr;

  const chunkRows = chunks.map((c, i) => {
    const span = offsetRangeToPageMinMax(c.start_offset, c.end_offset, pageRows);
    return {
      job_id: job.id,
      chunk_index: i,
      text: c.text,
      start_offset: c.start_offset,
      end_offset: c.end_offset,
      start_line: c.start_line,
      end_line: c.end_line,
      status: "pending",
      page_number_min: span.pageNumberMin,
      page_number_max: span.pageNumberMax,
    };
  });

  const { error: chunksErr } = await supabase.from("analysis_chunks").insert(chunkRows);
  if (chunksErr) {
    console.error(`[extract] correlationId=${correlationId} chunks insert error=`, chunksErr.message);
    return { error: chunksErr.message };
  }

  return { jobId: job.id };
}

const PAGE_JOIN = "\n\n";

/** CSS font-family stack from client; strip anything that could break inline styles. */
function sanitizeDisplayFontStack(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const t = stripInvalidUnicodeForDb(input.trim()).slice(0, 480);
  if (!t || /[;{}<>@]/.test(t)) return null;
  return t;
}

async function persistMultipageExtract(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  correlationId: string,
  versionId: string,
  scriptId: string,
  pagesInput: Array<{ pageNumber?: number; text?: string; html?: string | null; displayFontStack?: string }>,
  enqueueAnalysis: boolean,
  userId: string,
  v: ScriptVersionRow
): Promise<{ error?: string }> {
  const sorted = [...pagesInput].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
  const pageContents = sorted.map((p) => sanitizePageText(String(p.text ?? "")));
  const canonicalContent = pageContents.join(PAGE_JOIN);
  const contentHash = await sha256Hash(canonicalContent);
  const extractedTextHash = await sha256Hash(canonicalContent);

  await supabase
    .from("script_versions")
    .update({ extraction_status: "extracting" })
    .eq("id", versionId);

  const { error: delErr } = await supabase.from("script_pages").delete().eq("version_id", versionId);
  if (delErr) {
    console.warn(`[extract] correlationId=${correlationId} script_pages delete failed:`, delErr.message);
  }

  const norm = (s: string) => (s ?? "").trim().normalize("NFC");
  const offsets = computePageGlobalOffsets(pageContents);
  const pageRows = sorted.map((p, i) => ({
    version_id: versionId,
    page_number: p.pageNumber ?? i + 1,
    content: pageContents[i] ?? "",
    content_html:
      p.html != null && typeof p.html === "string"
        ? stripInvalidUnicodeForDb(norm(String(p.html))) || null
        : null,
    start_offset_global: offsets[i]?.start_offset_global ?? 0,
    end_offset_global: offsets[i]?.end_offset_global ?? 0,
    display_font_stack: sanitizeDisplayFontStack(p.displayFontStack),
  }));

  const { error: insErr } = await supabase.from("script_pages").insert(pageRows);
  if (insErr) {
    console.warn(`[extract] correlationId=${correlationId} script_pages insert failed:`, insErr.message);
    await supabase.from("script_versions").update({ extraction_status: "failed" }).eq("id", versionId);
    return { error: insErr.message };
  }

  const { error: updateErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: canonicalContent,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
    })
    .eq("id", versionId);

  if (updateErr) {
    return { error: updateErr.message };
  }

  const editorSave = await saveScriptEditorContent(
    supabase,
    versionId,
    scriptId,
    canonicalContent,
    contentHash,
    null
  );
  if (editorSave.error) {
    console.warn(`[extract] correlationId=${correlationId} script_text save failed:`, editorSave.error);
  }

  if (enqueueAnalysis) {
    const ingest = await runIngest(
      supabase,
      versionId,
      scriptId,
      canonicalContent,
      contentHash,
      userId,
      correlationId
    );
    if ("error" in ingest) {
      return { error: ingest.error };
    }
  }

  insertAuditEventMinimal(supabase, {
    event_type: "SCRIPT_TEXT_EXTRACTED",
    actor_user_id: userId,
    target_type: "script_version",
    target_id: versionId,
    target_label: stripInvalidUnicodeForDb(v.source_file_name ?? versionId),
    correlation_id: correlationId,
    metadata: { script_id: scriptId, page_count: pageRows.length },
  }).catch((e) => console.warn(`[extract] correlationId=${correlationId} audit SCRIPT_TEXT_EXTRACTED:`, e));

  return {};
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

  type Body = {
    versionId?: string;
    text?: string;
    contentHtml?: string | null;
    enqueueAnalysis?: boolean;
    pages?: Array<{ pageNumber?: number; text?: string; html?: string | null; displayFontStack?: string }>;
  };
  let body: Body;
  try {
    const raw = await req.text();
    // PDF/extracted text can contain \u not followed by 4 hex digits (e.g. literal backslash-u).
    const safeRaw = raw.replace(/\\(?=u(?![0-9a-fA-F]{4}))/g, "\\\\");
    body = JSON.parse(safeRaw) as Body;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON body";
    return json({ error: msg }, 400);
  }
  // Only enqueue analysis when explicitly requested (e.g. "Start Smart Analysis"). Import must not trigger analysis.
  const enqueueAnalysis = body.enqueueAnalysis === true;
  // Normalize Unicode (NFC) so Arabic and other script from PDFs is consistent and safe for storage.
  const norm = (s: string) => (s ?? "").trim().normalize("NFC");
  const contentHtml =
    body.contentHtml != null && typeof body.contentHtml === "string"
      ? stripInvalidUnicodeForDb(norm(body.contentHtml)) || null
      : null;
  const pagesInput = Array.isArray(body.pages) ? body.pages : undefined;
  const hasPages = pagesInput != null && pagesInput.length > 0;

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
  const canReplace = await isSuperAdminOrAdmin(supabase, auth.userId);
  // Allow Regulators (and any user) to extract for their own quick-analysis script
  let canExtract = canReplace;
  if (!canExtract) {
    const { data: script } = await supabase
      .from("scripts")
      .select("id, created_by, assignee_id, is_quick_analysis")
      .eq("id", v.script_id)
      .single();
    const s = script as { created_by: string | null; assignee_id: string | null; is_quick_analysis?: boolean } | null;
    canExtract = !!s && s.is_quick_analysis === true && (s.created_by === auth.userId || s.assignee_id === auth.userId);
  }
  if (!canExtract) return json({ error: "Only Admin/Super Admin can replace script files." }, 403);

  if (v.extraction_status === "done" && v.extracted_text) {
    return json(toFrontendVersion(v));
  }

  if (hasPages) {
    const sorted = [...pagesInput!].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
    const pe = await persistMultipageExtract(
      supabase,
      correlationId,
      versionId,
      v.script_id,
      sorted,
      enqueueAnalysis,
      auth.userId,
      v
    );
    if (pe.error) return json({ error: pe.error }, 500);

    const { data: updated } = await supabase
      .from("script_versions")
      .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at")
      .eq("id", versionId)
      .single();

    return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
  }

  let extractedText: string;

  if (body.text != null && typeof body.text === "string") {
    extractedText = norm(body.text);
  } else {
    const ext = (v.source_file_name || "").toLowerCase().split(".").pop() || "";
    if (ext === "pdf") {
      const { error: queueErr } = await supabase
        .from("script_versions")
        .update({ extraction_status: "extracting" })
        .eq("id", versionId);
      if (queueErr) {
        return json({ error: queueErr.message }, 500);
      }
      const { data: queued } = await supabase
        .from("script_versions")
        .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at")
        .eq("id", versionId)
        .single();
      return json({
        ...toFrontendVersion((queued ?? v) as ScriptVersionRow),
        queued_for_backend_extraction: true,
      }, 202);
    }

    const objectPath = v.source_file_path;
    if (!objectPath) {
      await supabase
        .from("script_versions")
        .update({ extraction_status: "failed" })
        .eq("id", versionId);
      return json({ error: "No source file path on version" }, 400);
    }
    const dl = await downloadScriptFileForExtract(supabase, objectPath);
    if ("error" in dl) {
      await supabase
        .from("script_versions")
        .update({ extraction_status: "failed" })
        .eq("id", versionId);
      console.error(`[extract] storage download failed path=${objectPath} err=${dl.error}`);
      return json({ error: dl.error || "Failed to download file" }, 500);
    }
    const blob = dl.blob;
    if (ext === "docx") {
      try {
        const ab = await blob.arrayBuffer();
        const pageTexts = await extractDocxPageTexts(ab);
        if (!pageTexts.length || !pageTexts.some((t) => t.trim())) {
          await supabase
            .from("script_versions")
            .update({ extraction_status: "failed" })
            .eq("id", versionId);
          return json({ error: "No text extracted from DOCX." }, 422);
        }
        const pages = pageTexts.map((t, i) => ({
          pageNumber: i + 1,
          text: t,
          html: null as string | null,
        }));
        const pe = await persistMultipageExtract(
          supabase,
          correlationId,
          versionId,
          v.script_id,
          pages,
          enqueueAnalysis,
          auth.userId,
          v
        );
        if (pe.error) {
          await supabase
            .from("script_versions")
            .update({ extraction_status: "failed" })
            .eq("id", versionId);
          return json({ error: pe.error }, 500);
        }
        const { data: updated } = await supabase
          .from("script_versions")
          .select(
            "id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at"
          )
          .eq("id", versionId)
          .single();
        return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[extract] correlationId=${correlationId} server extract failed:`, msg);
        await supabase
          .from("script_versions")
          .update({ extraction_status: "failed" })
          .eq("id", versionId);
        return json({ error: `Extraction failed: ${msg}` }, 500);
      }
    }
    if (ext === "txt") {
      extractedText = await blob.text();
    } else {
      extractedText = await blob.text();
    }
  }

  // Sanitize for storage: NFC, controls, lone surrogates (Postgres: "unsupported Unicode escape sequence").
  extractedText = stripInvalidUnicodeForDb(
    norm(extractedText).replace(/\0/g, "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""),
  );

  await supabase
    .from("script_versions")
    .update({ extraction_status: "extracting" })
    .eq("id", versionId);

  // Strategy A: when contentHtml is provided (e.g. DOCX), derive canonical plain text from HTML
  // so offsets match the formatted viewer DOM. Otherwise use extracted text.
  const normalized = stripInvalidUnicodeForDb(
    contentHtml != null && contentHtml.length > 0
      ? normalizeText(htmlToText(contentHtml))
      : normalizeText(extractedText),
  );
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
    contentHtml != null ? stripInvalidUnicodeForDb(contentHtml) : null,
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

  insertAuditEventMinimal(supabase, {
    event_type: "SCRIPT_TEXT_EXTRACTED",
    actor_user_id: auth.userId,
    target_type: "script_version",
    target_id: versionId,
    target_label: stripInvalidUnicodeForDb(v.source_file_name ?? versionId),
    correlation_id: correlationId,
    metadata: { script_id: v.script_id, path: "plain_or_txt" },
  }).catch((e) => console.warn(`[extract] correlationId=${correlationId} audit SCRIPT_TEXT_EXTRACTED:`, e));

  const { data: updated } = await supabase
    .from("script_versions")
    .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extracted_text_hash, created_at")
    .eq("id", versionId)
    .single();

  return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
});
