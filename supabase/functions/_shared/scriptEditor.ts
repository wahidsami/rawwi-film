/**
 * Script editor persistence: script_text + script_sections.
 * Call after extraction (or when queuing analysis) to store normalized content and sections.
 */
import type { createSupabaseAdmin } from "./supabaseAdmin.ts";
import { splitScriptSections, stripInvalidUnicodeForDb, sha256Hash } from "./utils.ts";
import { traceEdgeStep } from "./trace.ts";

export type SectionRow = {
  script_id: string;
  version_id: string;
  index: number;
  title: string;
  start_offset: number;
  end_offset: number;
  meta: Record<string, unknown>;
};

/**
 * Save normalized full text to script_text and insert script_sections for the version.
 * Idempotent: upserts script_text and replaces sections for this version_id.
 * contentHtml: optional HTML (e.g. from DOCX) for formatted viewer only.
 */
export async function saveScriptEditorContent(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  versionId: string,
  scriptId: string,
  normalizedContent: string,
  contentHash: string,
  contentHtml?: string | null
): Promise<{ error?: string }> {
  try {
    const content = stripInvalidUnicodeForDb(normalizedContent);
    const hash =
      content === normalizedContent ? contentHash : await sha256Hash(content);
    const html =
      contentHtml != null && typeof contentHtml === "string"
        ? stripInvalidUnicodeForDb(contentHtml)
        : null;
    const row: Record<string, unknown> = {
      version_id: versionId,
      content,
      content_hash: hash,
    };
    if (html != null) row.content_html = html;
    const { error: textErr } = await traceEdgeStep(
      "scriptEditor",
      "script_text.upsert",
      { versionId, scriptId, contentLength: content.length },
      () => supabase
        .from("script_text")
        .upsert(row, { onConflict: "version_id" }),
    );

    if (textErr) {
      return { error: textErr.message };
    }

    const sections = splitScriptSections(content);

    const { error: delErr } = await traceEdgeStep(
      "scriptEditor",
      "script_sections.delete",
      { versionId, scriptId },
      () => supabase
        .from("script_sections")
        .delete()
        .eq("version_id", versionId),
    );

    if (delErr) {
      return { error: delErr.message };
    }

    if (sections.length > 0) {
      const rows: SectionRow[] = sections.map((s, i) => ({
        script_id: scriptId,
        version_id: versionId,
        index: i,
        title: stripInvalidUnicodeForDb(s.title),
        start_offset: s.start_offset,
        end_offset: s.end_offset,
        meta: {},
      }));

      const { error: insErr } = await traceEdgeStep(
        "scriptEditor",
        "script_sections.insert",
        { versionId, scriptId, sectionCount: rows.length },
        () => supabase.from("script_sections").insert(rows),
      );
      if (insErr) {
        return { error: insErr.message };
      }
    }

    return {};
  } catch (e) {
    return { error: String(e) };
  }
}
