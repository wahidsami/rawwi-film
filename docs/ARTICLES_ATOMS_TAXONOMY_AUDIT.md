# Articles + Atoms Taxonomy Audit

This document describes the current **Articles** and **Atoms** taxonomy in the Raawi codebase: where the mapping lives, how it is used in the UI and backend, and known inconsistencies.

---

## 1. Current Articles

Articles are fixed **1–25**. Titles exist in three places with the same Arabic text; the worker uses numeric IDs only and has no atom sub-rules in the payload today.

| article_id | label / title_ar | source file |
|------------|------------------|-------------|
| 1 | احترام الذات الإلهية | All three sources below |
| 2 | احترام الأنبياء والرسل | " |
| 3 | احترام الدين الإسلامي | " |
| 4 | السيادة والأسس الوطنية | " |
| 5 | الأنظمة والقوانين | " |
| 6 | الحقوق والكرامة | " |
| 7 | حماية الطفل | " |
| 8 | منع الاستغلال | " |
| 9 | خصوصية الأفراد | " |
| 10 | منع التنمر | " |
| 11 | القيم الدينية | " |
| 12 | الآداب العامة | " |
| 13 | التماسك الأسري | " |
| 14 | حرمة الموتى | " |
| 15 | توقير كبار السن | " |
| 16 | المحظورات الضارة | " |
| 17 | المخدرات والمسكرات | " |
| 18 | السحر والشعوذة | " |
| 19 | القمار والميسر | " |
| 20 | العنف والترويع | " |
| 21 | عام وأخرى | " |
| 22 | احترام المهن | " |
| 23 | الصحة العامة | " |
| 24 | البيئة والحيوان | " |
| 25 | اللغة والهوية | " |

**Canonical source locations:**

**A) Worker (Router/Judge + aggregation)**  
`apps/worker/src/gcam.ts`

```ts
const PLACEHOLDER_TITLES: Record<number, string> = {
  1: "احترام الذات الإلهية",
  2: "احترام الأنبياء والرسل",
  // ... 3–25
  25: "اللغة والهوية",
};

export function getScriptStandardArticle(id: number): GCAMArticle {
  return {
    id,
    title_ar: PLACEHOLDER_TITLES[id] ?? `المادة ${id}`,
    text_ar: PLACEHOLDER_TITLES[id] ?? "",
    atoms: [],  // always empty
  };
}
```

**B) ScriptWorkspace (Manual Finding dropdown + display)**  
`apps/web/src/pages/ScriptWorkspace.tsx`

```ts
const ARTICLES_CHECKLIST = Array.from({ length: 25 }, (_, i) => {
  const id = i + 1;
  const titles: Record<number, string> = {
    1: 'احترام الذات الإلهية', 2: 'احترام الأنبياء والرسل', 3: 'احترام الدين الإسلامي',
    4: 'السيادة والأسس الوطنية', 5: 'الأنظمة والقوانين', 6: 'الحقوق والكرامة',
    // ... 7–25
    25: 'اللغة والهوية',
  };
  return { id: String(id), label: `Art ${id} - ${titles[id] ?? `Article ${id}`}`, value: id };
});
```

**C) Results page (report grouping + domain labels)**  
`apps/web/src/pages/Results.tsx`

```ts
const gcamArticles = [
  { id: 1, domainId: 'A', titleAr: 'احترام الذات الإلهية', titleEn: 'Respect for the Divine' },
  { id: 2, domainId: 'A', titleAr: 'احترام الأنبياء والرسل', titleEn: 'Respect for Prophets' },
  // ... 3–25 with domainId A|B|C|D|E
  { id: 25, domainId: 'E', titleAr: 'اللغة والهوية', titleEn: 'Language & Identity' },
];
```

**Note:** `ScriptWorkspace.tsx` also defines a short `ARTICLES` array (only 3 entries: id 1–3 with domainId and titleEn). It is **not** used for the Manual Finding Article dropdown; the dropdown uses `ARTICLES_CHECKLIST` (all 25).

---

## 2. Current Atoms

Atoms are **not** defined per article in a single canonical list. Behavior:

- **Worker (gcam):** `GCAMArticle.atoms` is always `[]` (`getScriptStandardArticle` returns no atoms). The Judge prompt builder in `openai.ts` would append `  atom_id: text_ar` lines if `a.atoms?.length` were set, but it never is.
- **ScriptWorkspace (Manual Finding):** Atom options are generated as **numeric sub-indices 1–10 per article** in a single shared structure.

**Source:** `apps/web/src/pages/ScriptWorkspace.tsx`

```ts
/** Atom options per article (for Add to findings). Backend accepts any atom_id string. */
const ARTICLE_ATOMS: Record<string, { value: string; label: string }[]> = {};
for (let a = 1; a <= 25; a++) {
  const id = String(a);
  ARTICLE_ATOMS[id] = [
    { value: '', label: '—' },
    ...Array.from({ length: 10 }, (_, i) => {
      const v = String(i + 1);
      return { value: v, label: `${a}.${v}` };
    }),
  ];
}
```

So in the UI, for every article 1–25, atoms are:

- **Empty (—)** value `''`
- **1 … 10** with labels `"1.1"`, `"1.2"`, … `"25.10"`

When submitting a manual finding, the frontend sends `atom_id` as either `null` or `${articleId}.${atomId}` (e.g. `"4.2"`) — see ScriptWorkspace form submit.

**Per-article list (structure only; labels are article.1 … article.10):**

- **Article 1:** —, 1.1, 1.2, …, 1.10  
- **Article 2:** —, 2.1, …, 2.10  
- …  
- **Article 25:** —, 25.1, …, 25.10  

There is **no** semantic list of atom labels (e.g. “4.1 = …”, “4.2 = …”) in code; only the pattern above.

**DB / API:**  
- `slang_lexicon.gcam_atom_id` and `analysis_findings.atom_id` are free-form text (e.g. `"4.2"`, `"1"`, or null).  
- Judge schema allows any `atom_id: z.string().optional().nullable()`.

---

## 3. UI Usage

- **Manual Finding modal (ScriptWorkspace)**  
  - **File:** `apps/web/src/pages/ScriptWorkspace.tsx`  
  - **Article dropdown:** Options from `ARTICLES_CHECKLIST` (all 25, label `Art N - title_ar`). Value is article id string.  
  - **Atom dropdown:** Options from `ARTICLE_ATOMS[formData.articleId] ?? ARTICLE_ATOMS['1']` — values `''`, `'1'`…`'10'`; labels `—`, `Art.1`…`Art.10`.  
  - **Submit:** `atomId` sent as `formData.atomId?.trim() ? `${formData.articleId}.${formData.atomId.trim()}` : null` (compound `"article.atom"` when atom selected).

- **Report grouping (Results page)**  
  - **File:** `apps/web/src/pages/Results.tsx`  
  - **Grouping:** Findings are grouped by **article** only: `groupByArticle(list)` builds `Map<number, AnalysisFinding[]>` keyed by `f.articleId`.  
  - **Domain grouping:** Articles are then grouped by domain using `gcamArticles` (`articleDomain(articleId)`). Domains A–E and their labels come from the local `domains` array.  
  - **Order:** Within a domain, articles are shown in the order they appear in the grouped map; findings within an article are rendered in list order (no explicit sort by atom).  
  - **Display:** Each article block shows “مادة N” / “Article N” and the title from `gcamArticles` (or summary’s `title_ar`). Individual findings do not show atom in the Results inline card; atom is not used for grouping or sorting.

- **ScriptWorkspace findings list / tooltip**  
  - **File:** `apps/web/src/pages/ScriptWorkspace.tsx`  
  - **Display:** Article/atom shown as `formatAtomDisplay(f.articleId, f.atomId)` (e.g. “Art 4.2” or “4” when no atom).  
  - **formatAtomDisplay:** If `atomId` contains `"."`, it is shown as-is; otherwise `articleId.atomId` (e.g. legacy `"1"`…`"10"` → “4.1”).

- **FindingCard (shared component)**  
  - **File:** `apps/web/src/components/ui/FindingCard.tsx`  
  - **Display:** `finding.articleId` and `finding.subAtomId` — shows “Art N” or “Art N.subAtomId”.  
  - **Note:** The component expects the legacy `Finding` type (`subAtomId`). The findings API and AnalysisFinding use `atomId`. So if FindingCard is used with AnalysisFinding, `subAtomId` may be undefined and atom would not show unless the caller maps `atomId` → `subAtomId`.

- **Glossary (lexicon)**  
  - **File:** `apps/web/src/pages/Glossary.tsx`  
  - **Display:** “المادة {gcam_article_id} {gcam_atom_id ? `(${gcam_atom_id})` : ''}” — article number and optional atom in parentheses.  
  - **Form:** `gcam_article_id` (number) and `gcam_atom_id` (free text); no dropdown from ARTICLE_ATOMS.

---

## 4. Prompt / Backend Usage

- **Router**  
  - **File:** `apps/worker/src/openai.ts`  
  - **Payload:** `buildRouterArticlesPayload(articleList)` → one line per article: `المادة ${a.id}: ${a.title_ar}`.  
  - **Output:** `candidate_articles[]` with `article_id` (1–25). No atoms.

- **Judge**  
  - **File:** `apps/worker/src/openai.ts`  
  - **Payload:** `buildJudgeArticlesPayload(selectedArticles)` → for each article: `المادة ${a.id}: ${a.title_ar}\n${a.text_ar ?? ""}`; if `a.atoms?.length` then appends `\n  ${at.atom_id}: ${at.text_ar}` per atom.  
  - **Current behavior:** `getScriptStandardArticle()` always returns `atoms: []`, so the Judge prompt contains **no** atom lines.  
  - **Expected output (JUDGE_SYSTEM_AR / repair):** Each finding has `article_id` (number) and optional `atom_id` (string, e.g. `"4.2"`).  
  - **Schema:** `apps/worker/src/schemas.ts` — `article_id: z.number().min(1).max(25)`, `atom_id: z.string().optional().nullable()`.

- **Pipeline**  
  - **File:** `apps/worker/src/pipeline.ts`  
  - **Lexicon findings:** `article_id: m.articleId`, `atom_id: m.atomId` from `slang_lexicon` (`gcam_article_id`, `gcam_atom_id`).  
  - **AI findings:** `article_id` / `atom_id` from Judge output.  
  - **Dedupe/overlap:** Same `article_id` + `atom_id` used for overlap key and evidence hash.

- **Aggregation**  
  - **File:** `apps/worker/src/aggregation.ts`  
  - **Per-article:** Builds `byArticle` (1–25) with `title_ar`, findings, severity counts, and `atoms: Set<string>` of all `f.atom_id` present.  
  - **Output:** `checklist_articles[]` (article_id, title_ar, status, counts, **triggered_atoms**), and `findings_by_article[]` with **triggered_atoms** and per-finding `atom_id` in `top_findings`.

- **Findings API**  
  - **File:** `supabase/functions/findings/index.ts`  
  - **Select:** `article_id`, `atom_id` returned; list ordered by `article_id` ascending.  
  - **Manual finding create:** Expects `articleId` (number), `atomId` (string or null); stored as `article_id`, `atom_id`.

---

## 5. Known Inconsistencies

| Issue | Detail |
|-------|--------|
| **Article titles in three places** | Same 25 Arabic titles are duplicated in `gcam.ts` (PLACEHOLDER_TITLES), `ScriptWorkspace.tsx` (ARTICLES_CHECKLIST titles), and `Results.tsx` (gcamArticles). Any change must be done in all three. |
| **Atom ID format** | Stored and transmitted as: compound `"4.2"`, or bare `"1"`…`"10"` (legacy). Manual form sends compound `"article.atom"`; Judge can return either. `formatAtomDisplay` treats “contains `.`” as compound, else `articleId.atomId`. So “4” and “4.2” are both valid; “1” can mean article 1 only or atom 1 under an article. |
| **FindingCard vs API** | FindingCard uses `finding.subAtomId` (legacy Finding type). API and AnalysisFinding use `atomId`. If data comes from GET /findings, it has `atomId`; subAtomId may be undefined so the card can show only the article number. |
| **No atoms in Judge prompt** | `getScriptStandardArticle()` always returns `atoms: []`, so the model is never given per-article atom rules (e.g. “4.1: …”, “4.2: …”). Atom IDs in findings are model-chosen without a fixed list in the prompt. |
| **ScriptWorkspace ARTICLES vs ARTICLES_CHECKLIST** | `ARTICLES` (3 items) exists but is not used for the Manual Finding article dropdown; `ARTICLES_CHECKLIST` (25 items) is used. Redundant and easy to confuse. |
| **Domain only in Results** | Domain (A–E) exists only in `Results.tsx` (gcamArticles + domains). Worker and ScriptWorkspace have no domain notion; aggregation does not attach domain to articles. |
| **Atom options 1–10 only** | UI offers atoms “1”…“10” for every article. Backend and Judge accept any string; no validation against a fixed list. If policy uses “4.1”, “4.2”, “4.17”, the dropdown cannot select “4.17”. |

---

## Summary Table

| Concern | Location | Notes |
|---------|----------|--------|
| Article list (1–25) | gcam.ts, ScriptWorkspace.tsx, Results.tsx | Same titles in 3 files; worker uses gcam only for Judge. |
| Atom list per article | ScriptWorkspace.tsx only (ARTICLE_ATOMS) | Synthetic 1–10 per article; no semantic labels; worker has no atoms in gcam. |
| Manual Finding Article/Atom | ScriptWorkspace.tsx | ARTICLES_CHECKLIST + ARTICLE_ATOMS; atom_id sent as "art.atom". |
| Report grouping | Results.tsx, aggregation.ts | By article_id; then by domain (Results only); triggered_atoms collected. |
| Judge/Router payload | openai.ts, gcam.ts | Articles with title_ar; atoms array always empty so not sent. |
| Display (Art N / N.atom) | formatAtomDisplay (ScriptWorkspace), FindingCard (subAtomId) | Compound vs legacy handling; FindingCard expects subAtomId. |
