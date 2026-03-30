type AdminClient = {
  from: (table: string) => {
    select: (cols: string) => any;
  };
};

function buildAtomMatchCandidates(articleId: number, normalizedAtomId: string): Set<string> {
  const candidates = new Set<string>();
  const trimmed = normalizedAtomId.trim();
  if (!trimmed) return candidates;

  candidates.add(trimmed);

  const suffixMatch = trimmed.match(/-(\d+)$/);
  if (suffixMatch) {
    const suffix = String(parseInt(suffixMatch[1], 10));
    candidates.add(suffix);
    candidates.add(`${articleId}-${suffix}`);
    candidates.add(`${articleId}.${suffix}`);
  }

  return candidates;
}

function normalizeMappedAtomCode(articleId: number, rawCode: string | null | undefined): string | null {
  const raw = String(rawCode ?? "").trim();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    return String(parseInt(raw, 10));
  }

  if (/^\d+-\d+$/.test(raw)) {
    const [mappedArticle, mappedAtom] = raw.split("-");
    return `${parseInt(mappedArticle, 10)}-${parseInt(mappedAtom, 10)}`;
  }

  if (/^\d+\.\d+$/.test(raw)) {
    const [mappedArticle, mappedAtom] = raw.split(".");
    return `${parseInt(mappedArticle, 10)}-${parseInt(mappedAtom, 10)}`;
  }

  const normalizedForArticle = normalizeAtomIdForArticle(articleId, raw);
  return normalizedForArticle || raw;
}

export function normalizeAtomIdForArticle(articleId: number, atomId: string | null | undefined): string | null {
  if (!atomId) return null;
  const raw = String(atomId).trim();
  if (!raw) return null;
  if (/^\d+-\d+$/.test(raw)) {
    const [a, b] = raw.split("-");
    return Number(a) === articleId ? `${articleId}-${parseInt(b, 10)}` : `${articleId}-${parseInt(b, 10)}`;
  }
  if (/^\d+\.\d+$/.test(raw)) {
    const [, atom] = raw.split(".");
    return `${articleId}-${parseInt(atom, 10)}`;
  }
  const numeric = raw.replace(/[^\d]/g, "");
  if (!numeric) return `${articleId}-${raw}`;
  return `${articleId}-${parseInt(numeric, 10)}`;
}

export async function validateArticleAtomLink(
  supabase: AdminClient,
  articleId: number,
  atomId: string | null | undefined
): Promise<{ ok: boolean; normalizedAtomId: string | null; reason?: string }> {
  if (!Number.isFinite(articleId) || articleId < 1 || articleId > 26) {
    return { ok: false, normalizedAtomId: null, reason: "articleId must be between 1 and 26" };
  }
  const normalizedAtomId = normalizeAtomIdForArticle(articleId, atomId);
  if (!normalizedAtomId) return { ok: true, normalizedAtomId: null };

  const matchCandidates = buildAtomMatchCandidates(articleId, normalizedAtomId);
  const { data: rows, error } = await supabase
    .from("policy_article_atom_map")
    .select("id, local_atom_code")
    .eq("article_id", articleId)
    .eq("is_active", true);
  if (error) {
    return { ok: true, normalizedAtomId };
  }
  const list = (rows ?? []) as Array<{ id: string; local_atom_code: string | null }>;
  if (!list.length) {
    return { ok: true, normalizedAtomId };
  }

  const mappedCodes = list
    .map((r) => normalizeMappedAtomCode(articleId, r.local_atom_code))
    .filter((value): value is string => Boolean(value));

  if (!mappedCodes.length) {
    return { ok: true, normalizedAtomId };
  }

  const matched = mappedCodes.some((mappedCode) => {
    if (matchCandidates.has(mappedCode)) return true;
    const normalizedMapped = normalizeMappedAtomCode(articleId, mappedCode);
    return normalizedMapped ? matchCandidates.has(normalizedMapped) : false;
  });

  if (!matched) {
    return { ok: false, normalizedAtomId, reason: `Atom ${normalizedAtomId} is not mapped to article ${articleId}` };
  }
  return { ok: true, normalizedAtomId };
}
