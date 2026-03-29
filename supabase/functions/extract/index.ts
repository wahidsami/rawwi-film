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
  htmlToTextPreserveTables,
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
  extraction_progress?: Record<string, unknown> | null;
  extraction_error?: string | null;
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
    extraction_progress: row.extraction_progress ?? undefined,
    extraction_error: row.extraction_error ?? undefined,
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

function isDocxTablePreservationEnabled(): boolean {
  try {
    // Default OFF for a staged rollout because canonical DOCX text also drives
    // offset-sensitive review flows. Ops can enable and rollback with one env flip.
    return (Deno.env.get("EXTRACT_PRESERVE_DOCX_TABLES") ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

function detectProbableTableFromText(text: string): {
  detected: boolean;
  confidence: "low" | "medium" | "high";
  rowCount: number;
  dominantColumns: number;
  reasons: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6 && line.length <= 240);

  if (lines.length < 2) {
    return {
      detected: false,
      confidence: "low",
      rowCount: 0,
      dominantColumns: 0,
      reasons: [],
    };
  }

  let tabRows = 0;
  let pipeRows = 0;
  let wideGapRows = 0;
  let numericRows = 0;
  const columnCounts = new Map<number, number>();

  for (const line of lines) {
    const tabCols = line.split(/\t+/).map((part) => part.trim()).filter(Boolean).length;
    const pipeCols = line.split(/\s*\|\s*/).map((part) => part.trim()).filter(Boolean).length;
    const wideGapCols = line.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean).length;
    const bestCols = Math.max(tabCols, pipeCols, wideGapCols);

    if (tabCols >= 2) tabRows += 1;
    if (pipeCols >= 2) pipeRows += 1;
    if (wideGapCols >= 3) wideGapRows += 1;
    if (bestCols >= 2) {
      columnCounts.set(bestCols, (columnCounts.get(bestCols) ?? 0) + 1);
      if (/\d/.test(line)) numericRows += 1;
    }
  }

  const dominantEntry = [...columnCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [0, 0];
  const dominantColumns = dominantEntry[0];
  const dominantRows = dominantEntry[1];
  const reasons: string[] = [];
  if (tabRows >= 2) reasons.push("tab_aligned_rows");
  if (pipeRows >= 2) reasons.push("pipe_delimited_rows");
  if (wideGapRows >= 3) reasons.push("multi_gap_aligned_rows");
  if (dominantRows >= 2 && dominantColumns >= 2) reasons.push("consistent_column_count");
  if (numericRows >= 2) reasons.push("numeric_cells");

  const detected =
    pipeRows >= 2 ||
    tabRows >= 2 ||
    (wideGapRows >= 3 && dominantRows >= 2 && dominantColumns >= 2);

  const confidence: "low" | "medium" | "high" =
    detected && dominantRows >= 3 && dominantColumns >= 3
      ? "high"
      : detected && reasons.length >= 2
        ? "medium"
        : "low";

  return {
    detected,
    confidence,
    rowCount: detected ? Math.max(dominantRows, tabRows, pipeRows, wideGapRows) : 0,
    dominantColumns: detected ? dominantColumns : 0,
    reasons,
  };
}

function detectProbableMultiColumnFromText(text: string): {
  detected: boolean;
  confidence: "low" | "medium" | "high";
  rowCount: number;
  reasons: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 10 && line.length <= 260);

  if (lines.length < 4) {
    return { detected: false, confidence: "low", rowCount: 0, reasons: [] };
  }

  let wideGapRows = 0;
  let alphaHeavyRows = 0;
  for (const line of lines) {
    const parts = line.split(/\s{3,}/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      wideGapRows += 1;
      if (parts.every((part) => !/\d/.test(part))) alphaHeavyRows += 1;
    }
  }

  const reasons: string[] = [];
  if (wideGapRows >= 4) reasons.push("wide_gap_parallel_rows");
  if (alphaHeavyRows >= 3) reasons.push("text_columns_without_numeric_cells");
  const detected = wideGapRows >= 4 && alphaHeavyRows >= 2;
  const confidence: "low" | "medium" | "high" =
    detected && alphaHeavyRows >= 4 ? "high" : detected ? "medium" : "low";
  return { detected, confidence, rowCount: detected ? wideGapRows : 0, reasons };
}

function detectProbableFormFromText(text: string): {
  detected: boolean;
  confidence: "low" | "medium" | "high";
  fieldLineCount: number;
  reasons: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3 && line.length <= 180);

  if (lines.length < 3) {
    return { detected: false, confidence: "low", fieldLineCount: 0, reasons: [] };
  }

  let colonRows = 0;
  let checkboxRows = 0;
  let dottedRows = 0;
  for (const line of lines) {
    if (/[:：]\s*\S/u.test(line)) colonRows += 1;
    if (/[☐☑☒■□✓]\s*\S/u.test(line)) checkboxRows += 1;
    if (/\.{3,}|_{3,}/u.test(line)) dottedRows += 1;
  }
  const reasons: string[] = [];
  if (colonRows >= 3) reasons.push("label_value_rows");
  if (checkboxRows >= 2) reasons.push("checkbox_rows");
  if (dottedRows >= 2) reasons.push("fill_in_blank_rows");
  const detected = colonRows >= 3 || checkboxRows >= 2 || (colonRows >= 2 && dottedRows >= 2);
  const confidence: "low" | "medium" | "high" =
    detected && (checkboxRows >= 3 || (colonRows >= 4 && dottedRows >= 2))
      ? "high"
      : detected
        ? "medium"
        : "low";
  return { detected, confidence, fieldLineCount: Math.max(colonRows, checkboxRows, dottedRows), reasons };
}

function normalizeHeaderFooterCandidate(value: string): string {
  return value
    .replace(/\d+/g, "#")
    .replace(/[.:،؛\-–—_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRepeatedHeaderSuppressionEnabled(): boolean {
  try {
    return (Deno.env.get("EXTRACT_STRIP_REPEATED_HEADERS") ?? "").toLowerCase() === "true";
  } catch {
    return false;
  }
}

function summarizeDocumentCases(
  pagesInput: Array<{ text?: string; html?: string | null }>,
  contentHtml?: string | null,
): {
  flags: string[];
  totalPages: number;
  probableTablePages: number[];
  probableTableCount: number;
  multiColumnPages: number[];
  multiColumnCount: number;
  formLayoutPages: number[];
  formLayoutCount: number;
  repeatedHeaderFooterPages: number[];
  repeatedHeaderFooterCount: number;
  htmlTableDetected: boolean;
} {
  const flags = new Set<string>();
  const probableTablePages: number[] = [];
  const multiColumnPages: number[] = [];
  const formLayoutPages: number[] = [];
  const repeatedHeaderFooterPages: number[] = [];

  const topCounts = new Map<string, number>();
  const bottomCounts = new Map<string, number>();

  pagesInput.forEach((page, index) => {
    const text = String(page.text ?? "");
    const probableTable = detectProbableTableFromText(text);
    const probableMultiColumn = detectProbableMultiColumnFromText(text);
    const probableForm = detectProbableFormFromText(text);
    if (probableTable.detected) {
      flags.add("probable_table_detected");
      probableTablePages.push(index + 1);
    }
    if (probableMultiColumn.detected) {
      flags.add("probable_multi_column_layout");
      multiColumnPages.push(index + 1);
    }
    if (probableForm.detected) {
      flags.add("probable_form_layout");
      formLayoutPages.push(index + 1);
    }

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const top = normalizeHeaderFooterCandidate(lines[0] ?? "");
    const bottom = normalizeHeaderFooterCandidate(lines[lines.length - 1] ?? "");
    if (top.length >= 6 && top.length <= 80) topCounts.set(top, (topCounts.get(top) ?? 0) + 1);
    if (bottom.length >= 6 && bottom.length <= 80) bottomCounts.set(bottom, (bottomCounts.get(bottom) ?? 0) + 1);
  });

  pagesInput.forEach((page, index) => {
    const lines = String(page.text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const top = normalizeHeaderFooterCandidate(lines[0] ?? "");
    const bottom = normalizeHeaderFooterCandidate(lines[lines.length - 1] ?? "");
    const repeated = (top.length >= 6 && (topCounts.get(top) ?? 0) >= 3) || (bottom.length >= 6 && (bottomCounts.get(bottom) ?? 0) >= 3);
    if (repeated) repeatedHeaderFooterPages.push(index + 1);
  });
  if (repeatedHeaderFooterPages.length > 0) flags.add("probable_repeated_header_footer");

  const htmlTableDetected = typeof contentHtml === "string" && /<table\b/i.test(contentHtml);
  if (htmlTableDetected) flags.add("docx_html_table_detected");

  return {
    flags: [...flags],
    totalPages: pagesInput.length,
    probableTablePages,
    probableTableCount: probableTablePages.length,
    multiColumnPages,
    multiColumnCount: multiColumnPages.length,
    formLayoutPages,
    formLayoutCount: formLayoutPages.length,
    repeatedHeaderFooterPages,
    repeatedHeaderFooterCount: repeatedHeaderFooterPages.length,
    htmlTableDetected,
  };
}

function stripRepeatedHeaderFooterFromPageText(
  text: string,
  repeatedTop: boolean,
  repeatedBottom: boolean,
): { text: string; removedTop: string | null; removedBottom: string | null; stripped: boolean } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return { text, removedTop: null, removedBottom: null, stripped: false };
  }
  const strippedLines = [...lines];
  let removedTop: string | null = null;
  let removedBottom: string | null = null;
  if (repeatedBottom && strippedLines.length > 1) removedBottom = strippedLines.pop() ?? null;
  if (repeatedTop && strippedLines.length > 1) removedTop = strippedLines.shift() ?? null;
  if (removedTop == null && removedBottom == null) {
    return { text, removedTop: null, removedBottom: null, stripped: false };
  }
  return {
    text: strippedLines.length > 0 ? strippedLines.join("\n") : text,
    removedTop,
    removedBottom,
    stripped: true,
  };
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
  const documentCases = summarizeDocumentCases(sorted);
  const stripRepeatedHeaders = isRepeatedHeaderSuppressionEnabled();
  const topCounts = new Map<string, number>();
  const bottomCounts = new Map<string, number>();

  sorted.forEach((p) => {
    const lines = String(p.text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const top = normalizeHeaderFooterCandidate(lines[0] ?? "");
    const bottom = normalizeHeaderFooterCandidate(lines[lines.length - 1] ?? "");
    if (top.length >= 6 && top.length <= 80) topCounts.set(top, (topCounts.get(top) ?? 0) + 1);
    if (bottom.length >= 6 && bottom.length <= 80) bottomCounts.set(bottom, (bottomCounts.get(bottom) ?? 0) + 1);
  });

  const pageContents = sorted.map((p) => {
    const originalText = sanitizePageText(String(p.text ?? ""));
    if (!stripRepeatedHeaders || documentCases.repeatedHeaderFooterCount === 0) return originalText;
    const lines = originalText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const top = normalizeHeaderFooterCandidate(lines[0] ?? "");
    const bottom = normalizeHeaderFooterCandidate(lines[lines.length - 1] ?? "");
    const repeatedTop = top.length >= 6 && (topCounts.get(top) ?? 0) >= 3;
    const repeatedBottom = bottom.length >= 6 && (bottomCounts.get(bottom) ?? 0) >= 3;
    return stripRepeatedHeaderFooterFromPageText(originalText, repeatedTop, repeatedBottom).text;
  });
  const canonicalContent = pageContents.join(PAGE_JOIN);
  const contentHash = await sha256Hash(canonicalContent);
  const extractedTextHash = await sha256Hash(canonicalContent);

  await supabase
    .from("script_versions")
    .update({
      extraction_status: "extracting",
      extraction_progress: { phase: "saving_pages" },
      extraction_error: null,
    })
    .eq("id", versionId);

  const { error: delErr } = await supabase.from("script_pages").delete().eq("version_id", versionId);
  if (delErr) {
    console.warn(`[extract] correlationId=${correlationId} script_pages delete failed:`, delErr.message);
  }

  const norm = (s: string) => (s ?? "").trim().normalize("NFC");
  const offsets = computePageGlobalOffsets(pageContents);
  const pageRows = sorted.map((p, i) => {
    const probableTable = detectProbableTableFromText(pageContents[i] ?? "");
    const probableMultiColumn = detectProbableMultiColumnFromText(pageContents[i] ?? "");
    const probableForm = detectProbableFormFromText(pageContents[i] ?? "");
    const originalText = sanitizePageText(String(p.text ?? ""));
    const originalLines = originalText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const top = normalizeHeaderFooterCandidate(originalLines[0] ?? "");
    const bottom = normalizeHeaderFooterCandidate(originalLines[originalLines.length - 1] ?? "");
    const repeatedTop = top.length >= 6 && (topCounts.get(top) ?? 0) >= 3;
    const repeatedBottom = bottom.length >= 6 && (bottomCounts.get(bottom) ?? 0) >= 3;
    const repeatedHeaderFooter = stripRepeatedHeaders
      ? stripRepeatedHeaderFooterFromPageText(originalText, repeatedTop, repeatedBottom)
      : { text: originalText, removedTop: null, removedBottom: null, stripped: false };
    const documentFlags = [
      ...(probableTable.detected ? ["probable_table_detected"] : []),
      ...(probableMultiColumn.detected ? ["probable_multi_column_layout"] : []),
      ...(probableForm.detected ? ["probable_form_layout"] : []),
      ...(documentCases.repeatedHeaderFooterPages.includes(i + 1) ? ["probable_repeated_header_footer"] : []),
    ];
    const meta: Record<string, unknown> = documentFlags.length > 0
      ? {
          documentFlags,
          ...(probableTable.detected ? { probableTable } : {}),
          ...(probableMultiColumn.detected ? { probableMultiColumn } : {}),
          ...(probableForm.detected ? { probableFormLayout: probableForm } : {}),
          ...(documentCases.repeatedHeaderFooterPages.includes(i + 1)
            ? {
                repeatedHeaderFooter: {
                  detected: true,
                  stripped: repeatedHeaderFooter.stripped,
                  removedTop: repeatedHeaderFooter.removedTop,
                  removedBottom: repeatedHeaderFooter.removedBottom,
                },
              }
            : {}),
        }
      : {};
    return ({
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
    meta,
  });
  });

  const { error: insErr } = await supabase.from("script_pages").insert(pageRows);
  if (insErr) {
    console.warn(`[extract] correlationId=${correlationId} script_pages insert failed:`, insErr.message);
    await supabase.from("script_versions").update({ extraction_status: "failed", extraction_error: insErr.message, extraction_progress: { phase: "failed" } }).eq("id", versionId);
    return { error: insErr.message };
  }

  const { error: updateErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: canonicalContent,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
      extraction_progress: {
        phase: "done",
        pageCount: pageRows.length,
        documentCases,
        featureFlags: {
          repeatedHeaderFooterSuppression: stripRepeatedHeaders,
        },
      },
      extraction_error: null,
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

  if (req.method !== "POST" && req.method !== "PATCH") {
    return json({ error: "Method not allowed" }, 405);
  }

  type Body = {
    versionId?: string;
    action?: "cancel";
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
    .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at")
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

  if (req.method === "PATCH") {
    if (body.action !== "cancel") {
      return json({ error: "Unsupported extract action" }, 400);
    }

    const nextStatus =
      v.extraction_status === "extracting" || v.extraction_status === "pending"
        ? "cancelled"
        : v.extraction_status;

    if (nextStatus !== v.extraction_status) {
      const { error: cancelErr } = await supabase
        .from("script_versions")
        .update({
          extraction_status: nextStatus,
          extraction_progress: nextStatus === "cancelled" ? { phase: "cancelled" } : v.extraction_progress ?? {},
          extraction_error: null,
        })
        .eq("id", versionId);
      if (cancelErr) return json({ error: cancelErr.message }, 500);
    }

    const { data: updated } = await supabase
      .from("script_versions")
      .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at")
      .eq("id", versionId)
      .single();

    return json(toFrontendVersion((updated ?? { ...v, extraction_status: nextStatus }) as ScriptVersionRow));
  }

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
      .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at")
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
        .update({
          extraction_status: "extracting",
          extraction_progress: { phase: "queued_for_backend_pdf" },
          extraction_error: null,
        })
        .eq("id", versionId);
      if (queueErr) {
        return json({ error: queueErr.message }, 500);
      }
      const { data: queued } = await supabase
        .from("script_versions")
        .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at")
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
        .update({ extraction_status: "failed", extraction_error: "No source file path on version", extraction_progress: { phase: "failed" } })
        .eq("id", versionId);
      return json({ error: "No source file path on version" }, 400);
    }
    const dl = await downloadScriptFileForExtract(supabase, objectPath);
    if ("error" in dl) {
      await supabase
        .from("script_versions")
        .update({ extraction_status: "failed", extraction_error: dl.error || "Failed to download file", extraction_progress: { phase: "failed" } })
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
            .update({ extraction_status: "failed", extraction_error: "No text extracted from DOCX.", extraction_progress: { phase: "failed" } })
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
            .update({ extraction_status: "failed", extraction_error: pe.error, extraction_progress: { phase: "failed" } })
            .eq("id", versionId);
          return json({ error: pe.error }, 500);
        }
        const { data: updated } = await supabase
          .from("script_versions")
          .select(
            "id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at"
          )
          .eq("id", versionId)
          .single();
        return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[extract] correlationId=${correlationId} server extract failed:`, msg);
        await supabase
          .from("script_versions")
          .update({ extraction_status: "failed", extraction_error: msg, extraction_progress: { phase: "failed" } })
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
    .update({ extraction_status: "extracting", extraction_progress: { phase: "normalizing_text" }, extraction_error: null })
    .eq("id", versionId);

  const preserveDocxTables =
    contentHtml != null &&
    contentHtml.length > 0 &&
    /<table\b/i.test(contentHtml) &&
    isDocxTablePreservationEnabled();

  // Strategy A: when contentHtml is provided (e.g. DOCX), derive canonical plain text from HTML
  // so offsets match the formatted viewer DOM. Otherwise use extracted text.
  const normalized = stripInvalidUnicodeForDb(
    contentHtml != null && contentHtml.length > 0
      ? normalizeText(
          preserveDocxTables ? htmlToTextPreserveTables(contentHtml) : htmlToText(contentHtml),
        )
      : normalizeText(extractedText),
  );
  const contentHash = await sha256Hash(normalized);
  const extractedTextHash = await sha256Hash(extractedText);
  const documentCases = summarizeDocumentCases(
    [{ text: extractedText, html: contentHtml ?? null }],
    contentHtml ?? null,
  );

  const { error: updateErr } = await supabase
    .from("script_versions")
    .update({
      extracted_text: extractedText,
      extracted_text_hash: extractedTextHash,
      extraction_status: "done",
      extraction_progress: {
        phase: "done",
        documentCases,
        featureFlags: {
          docxTablePreservation: preserveDocxTables,
        },
      },
      extraction_error: null,
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
    .select("id, script_id, version_number, source_file_name, source_file_type, source_file_size, source_file_path, source_file_url, extracted_text, extraction_status, extraction_progress, extraction_error, extracted_text_hash, created_at")
    .eq("id", versionId)
    .single();

  return json(toFrontendVersion((updated ?? v) as ScriptVersionRow));
});
