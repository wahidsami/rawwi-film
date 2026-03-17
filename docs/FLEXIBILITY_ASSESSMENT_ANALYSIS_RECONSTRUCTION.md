# Flexibility Assessment: Can We Reconstruct Analysis on New Principles?

This document answers whether the current analysis code and concepts are **flexible enough** to support two outcomes from the owners’ meeting:

1. **Reduce confusion from shared atoms across articles** — clearer cards and reasoning when one snippet triggers multiple articles/atoms.
2. **Add a second analysis** — detect and list **words/phrases the owners want to pick by article**, including words that are not necessarily violations (review-only or informational).

---

## Short Answer

**Yes.** The system is flexible enough to reconstruct around new principles **without a full rewrite**. The pipeline is already staged (lexicon → router → judge → auditor → aggregation), data is stored per finding (article_id + atom_id), and we already have a “words bound to articles” concept (lexicon). The main work is:

- **Shared-atom confusion:** Persist and show **which atom applies to each article** on the card (primary + related) and optionally refine how we write or display rationale.
- **Second analysis (owner-defined words by article):** Reuse/extend the lexicon concept and add a dedicated report section (and optionally a separate pass or table) so “words to pick per article” can include non-violation terms.

---

## 1. Shared Atoms / Multiple Articles — Where the Confusion Comes From

### Current behaviour

- The **Judge** (and multi-pass) emits **one finding per (article_id, atom_id)** per snippet. So the same snippet can produce several findings, e.g.:
  - Article 4, atom 4-7 (ألفاظ أو إيحاءات غير لائقة)
  - Article 5, atom 5-2 (ألفاظ غير مناسبة للفئة العمرية)
  - Article 7, atom 7-2 (التحقير أو الإهانة القائمة على الجنس)
- **Aggregation** merges findings that refer to the **same span** (overlap clustering) into **one canonical card**.
- For that card we keep:
  - **One** “primary” finding (we choose by severity, specificity, auditor role, etc.) → its `article_id` and `atom_id` become the card’s primary article and (implicitly) atom.
  - **Related** = all other `article_id` in the cluster → we store only `related_article_ids` (list of numbers).
- We **do not** store **which atom** applies to each related article. So the card shows:
  - “المادة الأساسية: 5” (and in some places we could show 5-2, but not consistently)
  - “مواد مرتبطة: 4، 7” — **without** “4-7” and “7-2”.
- **Rationale** is one text per card (from the primary finding or the auditor). It often explains the snippet in general, so it doesn’t clearly separate “why Article 4,” “why Article 5,” “why Article 7.”

So the confusion is:

- **Cards:** Related articles are shown without their atoms, so it’s unclear *which* sub-rule (atom) of 4 or 7 is involved.
- **Reasoning:** One rationale for all articles/atoms mixed together, instead of a clear link “this sentence violates 5-2 because … and also touches 4-7 because …”.

### What we have in code (flexibility)

- **Per finding we already have** `article_id` and `atom_id`. So the **raw data** for “article 4 → 4-7, article 5 → 5-2, article 7 → 7-2” exists before aggregation.
- **Clustering** only merges by span; it doesn’t drop articles or atoms. We just don’t **carry** “atom per related article” into the canonical card.
- **Auditor** can be prompted to return assessments with primary + related and could be asked to output **rationale per (article, atom)** or a structured rationale.
- **UI** already shows primary article and related articles; it can be extended to show atom for each (once we persist it).

So the **concept and code are flexible**: we can add “atom per article” to the canonical model and UI, and optionally refine rationale (per-article or structured) without changing the overall pipeline.

---

## 2. Second Analysis: “Words to Pick According to Articles” (Including Non-Violations)

### What the owners asked for

- **Another analysis** that **detects and finds words** (and phrases) that **they** want to pick.
- These words are **bound to articles** (and possibly atoms): “when you see word X, tag it under article Y.”
- They explicitly said: **even words that are not considered violations** — i.e. they want to flag terms for review or awareness per article, not only “mandatory violation” terms.

So this is:

- **Word/phrase spotting** with **article (and optionally atom) binding**.
- **Two “modes”** of terms: (1) violation / mandatory (current glossary behaviour) and (2) review-only / informational (new or extended).

### What we already have (flexibility)

- **Lexicon (slang_lexicon):**
  - Columns: `term`, `gcam_article_id`, `gcam_atom_id`, `severity_floor`, `enforcement_mode` (e.g. soft_signal vs mandatory_finding), `is_active`.
  - So we **already** “bind” words to articles (and atoms). The Judge and lexicon matcher use this.
- **“Words to revisit”** section:
  - A separate pass (Revisit Spotter) that finds **occurrences** of lexicon terms in the script and lists them in the report **without** judging violation. So we already have “find these words and show where they appear.”
- **Multi-pass Judge** has a **Glossary pass** that emits findings for lexicon matches (mandatory). So “words → article/atom” is already in the pipeline.

So the **concept** of “words bound to articles” and “list where they appear” already exists. What’s missing for the owners’ request:

- **Allow “review-only” (or informational) terms** that:
  - Are still bound to an article (and optionally atom), and
  - Appear in a dedicated section (e.g. “كلمات/عبارات مرتبطة بالمواد” or “الكلمات المحددة حسب المواد”) **without** counting as violations and without requiring the AI to “consider them against the article” as a violation.
- Optionally a **separate list per article** in the UI (e.g. “تحت المادة 5: هذه العبارات ظهرت في النص”) so it’s clear which words are “picked” under which article.

That can be done by:

- **Extending the lexicon:** e.g. add `list_type` or use `enforcement_mode` like `"review_only"` / `"informational"` so that:
  - Matches are still found and stored (or collected in a separate structure),
  - They are still bound to `gcam_article_id` (and `gcam_atom_id`),
  - They are **not** pushed as violations into the main findings count, but are shown in the second section grouped by article.
- **Or** a separate table (e.g. `article_word_lists`) with (article_id, atom_id?, term, list_type) and a dedicated pass/section that only does “find these words, tag by article, show in report.” The current pipeline can host this as an extra step or an extra section fed from the same script text.

So again: **the analysis code and concept are flexible enough** to add this second analysis (owner-defined words per article, including non-violation terms) without rebuilding everything from scratch.

---

## 3. Reconstructing on New Principles — What Changes

### Principle 1: One card can show multiple (article, atom) pairs clearly

- **Data:** Extend the canonical finding (and any structure derived from it) to store **per-article atom**, e.g.:
  - `primary_article_id`, `primary_atom_id` (already exist in spirit; make them explicit and always shown),
  - `related_articles: { article_id, atom_id }[]` instead of (or in addition to) `related_article_ids: number[]`.
- **Aggregation:** When building the canonical card from a cluster, for each distinct (article_id, atom_id) in the cluster, add one entry to `related_articles` (and keep one as primary). So we never “lose” the atom for related articles.
- **Auditor (optional):** Prompt it to return or clarify atom per article and, if desired, a short rationale per (article, atom) or a structured rationale so the UI can show “لماذا المادة 5 (5-2): … ؛ لماذا المادة 4 (4-7): …”.
- **UI/PDF:** Show on each card:
  - المادة الأساسية: X (X-Y)
  - مواد مرتبطة: 4 (4-7)، 7 (7-2)
  - Rationale either as one clear paragraph that mentions each (article, atom) or as separate lines per article.

This is a **targeted change** to data shape, aggregation, and presentation — not a new pipeline.

### Principle 2: Two “analyses” in one report

- **Analysis A (current):** Context-aware compliance (router → judge → auditor) → violations + special notes. Cards show reasoning; we can make article+atom explicit as above.
- **Analysis B (new):** Owner-defined words/phrases bound to articles (and optionally atoms), including “review only” / “informational” terms. Output: a section like “كلمات/عبارات مرتبطة بالمواد” with, for each article (and optionally atom), the list of terms found and where they appear (snippet + offset), **without** counting them as violations.

Implementation options:

- **Option B1 — Extend lexicon:** Add `enforcement_mode` (e.g. `mandatory_finding` | `review_only` | `informational`). Lexicon matcher finds all. Mandatory → current behaviour (finding). Review/informational → same match flow but written to a separate structure or marked so aggregation puts them only in the “words per article” section and does not add to violation count.
- **Option B2 — Separate table + pass:** New table `article_word_lists(article_id, atom_id?, term, list_type)`. A separate pass (or reuse Revisit Spotter with different input) runs on the full script and outputs “mention list per article.” Report section built from that. No change to violation logic.

Both are compatible with the current architecture; B1 reuses more of the existing pipeline, B2 keeps “violation” and “owner word list” completely separate if desired.

---

## 4. Summary Table

| Goal | Flexible? | What to change |
|------|-----------|----------------|
| Show which atom applies to each article (primary + related) on the card | **Yes** | Persist (article_id, atom_id) per related article in canonical model; show in UI/PDF. |
| Clearer reasoning (no confusion from shared atoms) | **Yes** | Optional: structured or per-(article, atom) rationale from auditor; display per article on card. |
| Second analysis: words owners want to “pick” by article, including non-violations | **Yes** | Extend lexicon with review-only/informational mode and a dedicated report section, **or** add article_word_lists + dedicated pass/section. |
| Keep current analysis method and add the second one alongside | **Yes** | Second analysis is additive: new section (and optionally new table or lexicon mode), same report container. |

---

## 5. Conclusion

- **Shared-atom confusion:** The system already has per-finding (article_id, atom_id); we only need to **carry atom per related article** into the canonical card and **show** it (and optionally refine rationale). The analysis code and concept are **flexible enough** for this.
- **Second analysis (owner-defined words by article, including non-violations):** We already have “words bound to articles” (lexicon) and “list where they appear” (words to revisit). We can **extend** that with review-only/informational terms and a clear per-article section, or add a separate list and pass. Again, **flexible enough** to reconstruct this without a full rewrite.

So: **yes, the analysis code and concept are flexible enough to reconstruct around these new principles** — by evolving the canonical model and UI for (article, atom) clarity, and by adding or extending a “words per article” analysis and report section.
