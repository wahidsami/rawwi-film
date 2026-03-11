import { supabase } from "./db.js";

export type FindingRowForLinks = {
  id: string;
  article_id: number;
  atom_id: string | null;
  confidence?: number | null;
};

function conceptCode(articleId: number, atomId: string | null): string {
  if (!atomId) return `ART${articleId}_GENERIC`;
  const atom = String(atomId).replace(/[^\d-]/g, "");
  return `ART${articleId}_ATOM_${atom || "GENERIC"}`;
}

function localAtomCode(atomId: string | null): string | null {
  if (!atomId) return null;
  const m = String(atomId).match(/^\d+-(\d+)$/);
  return m ? m[1] : String(atomId);
}

export async function upsertFindingPolicyLinks(rows: FindingRowForLinks[]): Promise<void> {
  if (!rows.length) return;
  for (const row of rows) {
    const code = conceptCode(row.article_id, row.atom_id);
    const atomLocal = localAtomCode(row.atom_id);

    const { data: concept, error: cErr } = await supabase
      .from("policy_atom_concepts")
      .upsert(
        {
          code,
          title_ar: `مفهوم ${code}`,
          description_ar: `Auto-generated concept for article ${row.article_id}`,
          status: "active",
          version: 1,
        },
        { onConflict: "code" }
      )
      .select("id")
      .single();
    if (cErr || !concept) continue;

    const { data: mapping, error: mErr } = await supabase
      .from("policy_article_atom_map")
      .upsert(
        {
          article_id: row.article_id,
          atom_concept_id: (concept as { id: string }).id,
          local_atom_code: atomLocal,
          rationale_ar: "Auto-mapped from finding record",
          overlap_type: "primary",
          priority: 1,
          source: "worker_auto",
          is_active: true,
        },
        { onConflict: "article_id,atom_concept_id,is_active" }
      )
      .select("id")
      .single();
    if (mErr || !mapping) continue;

    await supabase
      .from("analysis_finding_policy_links")
      .upsert(
        {
          finding_id: row.id,
          article_id: row.article_id,
          atom_concept_id: (concept as { id: string }).id,
          map_id: (mapping as { id: string }).id,
          link_role: "primary",
          confidence: row.confidence ?? 0,
          rationale_ar: "Auto-linked during worker insert",
          created_by_model: "hybrid-v3",
        },
        { onConflict: "finding_id,article_id,atom_concept_id" }
      );
  }
}
