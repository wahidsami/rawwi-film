# Plan: Fix Article–Finding Relation and Duplication (Pre-Coding)

This document analyses the current gaps, defines the desired end state, and lists concrete enhancements with how each moves us toward the desired results. **No code yet**—implementation follows after approval.

---

## 1. Desired End State

| Goal | Description |
|------|-------------|
| **One card per incident** | A single finding card per unique incident (evidence). If one snippet touches articles 4, 5, 9, 16, the report shows **one** card with primary article + related articles. |
| **Correct primary article** | The “المادة الأساسية” is the most specific applicable article (e.g. 9, 14, 16), not the broad 4/5 unless no other fits. |
| **Related articles visible** | Each card shows “مواد مرتبطة” so auditors see full legal context without repetition. |
| **Count = unique incidents** | The top-level “مخالفات” count is the number of unique incidents (canonical count), not the sum of (finding × article). |
| **Summary and findings aligned** | When the AI summary says “سياق درامي نفسي وليس تحريضي”, findings in that context (e.g. delusional dialogue) are not over-flagged or are clearly tagged as needs_review. |

---

## 2. Current State (Root Causes)

### 2.1 Why the same incident appears many times

- **Backend**
  - **Chunk-level canonical IDs:** The hybrid pipeline runs **per chunk**. Overlap clustering and `canonical_finding_id` are computed only within that chunk’s findings. So the same phrase in two chunks gets two IDs; the same snippet under two articles in the same chunk gets one ID but **two DB rows** (one per article).
  - **Aggregation:** `canonical_findings` is built at **job level** in aggregation from deduped findings and overlap clustering. So we have a correct, deduplicated list in `summary_json.canonical_findings`.
  - **findings_by_article:** Built from **deduped** findings grouped by **article**. So each (article, finding) pair appears once under that article. The same incident under articles 4, 9, 16 appears three times (under مادة 4, مادة 9, مادة 16).
- **Frontend**
  - When the API returns **findings** (`hasRealFindings`), the app uses **renderFindingsFromReal(displayViolations)**. That list comes from DB rows deduped by `canonical_finding_id` in `location.v3`. Because those IDs are **chunk-scoped**, many rows have different IDs → dedupe barely reduces the list → we still show many cards.
  - When there are **no** findings from the API, the app uses **renderFindingsFromCanonicalSummary()** from `summary.canonical_findings`, which is already one-per-incident.
- **Conclusion:** The “single source of truth” for unique incidents is `summary_json.canonical_findings`, but the UI when it has DB findings uses the raw findings table (chunk-level IDs), so duplication remains.

### 2.2 Why primary article is often 4 or 5

- Resolver order: role primary > legal specificity (atom) > **non-broad (4,5)** > severity > confidence.
- If the judge or lexicon tags a finding with article 5 (or 4) and another with 9, and both are in the same cluster, the one with atom or “primary” role can still lose if the other has higher severity/confidence. So 4/5 can win.
- We may need a **hard rule**: when the cluster contains any article in {9, 10, 11, 12, 13, 14, 16, 17, 19, 20, 21, …}, do not choose 4 or 5 as primary unless **only** 4/5 are in the cluster.

### 2.3 Why summary and findings disagree

- The **script summary** is generated at aggregation time and sees the full script; it can say “سياق درامي نفسي وليس تحريضي”.
- **Findings** are produced per chunk by the judge + deep auditor without that script-level summary. So we get “violation” for delusional dialogue even when the summary says the work is compliant in context.
- We do not yet pass the script summary (or a short compliance hint) into the deep auditor or into a final post-step that can downgrade ruling.

---

## 3. Enhancements (What to Do)

### 3.1 Use canonical list as main source for the report (Frontend + contract)

**What:**  
When `summary.canonical_findings` exists and has length > 0, treat it as the **main** list for the analysis report:

- Main findings section: render from `canonical_findings` (grouped by `primary_article_id`), not from `findings` API + dedupe.
- Show “مخالفات” = `canonical_findings.length` (or a dedicated `unique_incidents_count` from backend), not `totals.findings_count`.
- Keep “real findings” from the API for: review actions (approve/reject), per-finding status, and linking cards to DB rows where needed. So: **data for “what to show” = canonical_findings; data for “review state” = findings API.**

**How it gets us there:**  
One row in `canonical_findings` per incident → one card per incident. Related articles are already on each canonical item, so we show primary + related without repeating the same snippet under multiple articles.

**Dependencies:**  
Backend must expose and keep populating `summary_json.canonical_findings` (already done). Optional: add `unique_incidents_count` or clearly document that the report uses `canonical_findings.length` for the main count.

---

### 3.2 Build findings_by_article from canonical_findings (Backend)

**What:**  
In aggregation, build `findings_by_article` from **canonical_findings** instead of from the full deduped list grouped by article:

- For each article, `top_findings` = canonical findings whose **primary_article_id** is that article (plus optional cap, e.g. top 10 per article).
- No more “same snippet under مادة 4 and مادة 9 and مادة 16”; each canonical finding appears only under its primary article.

**How it gets us there:**  
Any consumer (frontend, PDF, print view) that still uses `findings_by_article` sees no duplication. Counts per article become “number of incidents primarily under this article”.

**Dependencies:**  
None beyond aggregation refactor. Backward compatibility: checklist and severity counts can still be derived from the same canonical list (e.g. severity_counts from canonical_findings).

---

### 3.3 Prefer specific articles over 4/5 in primary selection (Backend)

**What:**  
In the primary-article resolver (legalMapper and aggregation’s `choosePrimaryFromDb`):

- Define **specific articles** (e.g. 6–24 excluding 4 and 5) and **broad articles** {4, 5}.
- Rule: if the cluster has at least one specific article, **primary must be chosen from specific articles** (same tie-break: role > atom > severity > confidence). Only if the cluster contains **only** 4 and/or 5 do we allow 4 or 5 as primary.

**How it gets us there:**  
“المادة الأساسية” will align with the most relevant GCAM topic (e.g. عنف، تحريض، شائعات) instead of defaulting to ضوابط المحتوى or التصنيف العمري when both exist in the cluster.

**Dependencies:**  
None. Pure change inside resolver logic.

---

### 3.4 Job-level canonical IDs for persisted findings (Backend, optional but recommended)

**What:**  
During **aggregation**, after building `canonical_findings`:

- For each row in `analysis_findings` for this job, set `location.v3.canonical_finding_id` (and primary_article_id, related_article_ids) to the **job-level** canonical finding that covers this row (e.g. by matching on span overlap with the canonical’s span).
- So every DB row carries the same canonical ID as in `summary_json.canonical_findings`.

**How it gets us there:**  
If the frontend ever falls back to “dedupe by canonical_finding_id from API findings”, it will get the same grouping as canonical_findings. Review actions (approve/reject) can still apply to individual DB rows while the report view stays one-card-per-incident.

**Dependencies:**  
Aggregation must have access to update `analysis_findings` (e.g. one update per finding or batched). Slightly more complex than 3.1+3.2 alone.

**Priority:**  
Can be Phase 2 after 3.1 and 3.2 are live; 3.1 already removes duplication by using canonical_findings as the main source.

---

### 3.5 Use script summary in ruling (Backend)

**What:**  
When generating the script summary at aggregation time, produce a short **compliance hint** (e.g. “سياق درامي نفسي”, “محايد”, “ليس تحريضي”). Then either:

- **Option A:** Pass that hint into the **deep auditor** on a future run (e.g. when we re-run auditor at job level), or  
- **Option B:** Add a **post-aggregation step** that, for each canonical finding, can downgrade `final_ruling` from `violation` to `needs_review` when (1) the summary’s compliance hint indicates “dramatic/neutral context” and (2) the finding’s depiction_type or evidence is “mention” / “delusion” / “dialogue” (no endorsement).

**How it gets us there:**  
Alignment between “النص إجمالاً متوافق” and the number/severity of violations; fewer over-flags on delusional or conflict dialogue when the summary says the work is not inciting.

**Dependencies:**  
Script summary already exists. Option B only needs aggregation-time logic and optional re-write of `final_ruling` on canonical_findings (and possibly on stored findings if we do 3.4).

---

### 3.6 PDF and print view use canonical data (Frontend)

**What:**  
Analysis PDF (and any print template that uses findings) should receive **canonical-based** data:

- Pass `canonical_findings` (or a list derived from it) into the PDF mapper so the PDF shows one finding per incident with primary + related articles.
- If the PDF currently uses `findings_by_article`, after 3.2 that list is already de-duplicated; alternatively, build the PDF input explicitly from `canonical_findings` grouped by primary article.

**How it gets us there:**  
The exported report matches the on-screen report: one card per incident, same primary/related labels.

**Dependencies:**  
3.2 (findings_by_article from canonical) makes this automatic if PDF consumes findings_by_article; otherwise we explicitly pass canonical_findings into the PDF builder.

---

## 4. How Each Enhancement Moves Us Toward the Desired Result

| Desired result | 3.1 Canonical as main source | 3.2 findings_by_article from canonical | 3.3 Prefer specific over 4/5 | 3.4 Job-level canonical IDs | 3.5 Summary in ruling | 3.6 PDF uses canonical |
|----------------|------------------------------|----------------------------------------|------------------------------|-----------------------------|------------------------|-------------------------|
| One card per incident | ✅ Direct: UI shows canonical list | ✅ Legacy/by-article view also one per incident | — | ✅ Consistent IDs if UI uses API dedupe | — | ✅ PDF one per incident |
| Correct primary article | — | — | ✅ Primary from specific when possible | — | — | — |
| Related articles visible | ✅ Already on canonical card | — | — | — | — | ✅ PDF shows same |
| Count = unique incidents | ✅ Count = canonical_findings.length | — | — | — | — | — |
| Summary and findings aligned | — | — | — | — | ✅ Downgrade by context | — |

---

## 5. Recommended Order of Implementation

1. **3.2** – Build `findings_by_article` from `canonical_findings` in aggregation.  
   Low risk, single place, fixes duplication for any consumer of findings_by_article.

2. **3.1** – Frontend: when `canonical_findings` exists, use it for the main report view and main count.  
   Biggest UX win: one card per incident and correct count without touching pipeline.

3. **3.3** – Primary article resolver: prefer specific articles over 4/5.  
   Improves correctness of “المادة الأساسية” everywhere.

4. **3.6** – Ensure PDF/print use canonical (or the new findings_by_article).  
   Parity between screen and export.

5. **3.5** – Use script summary in ruling (post-step or auditor hint).  
   Improves alignment; can be tuned after 1–4 are stable.

6. **3.4** – (Optional) Backfill job-level canonical_finding_id in analysis_findings at aggregation.  
   Unifies IDs for future-proof dedupe and review flows.

---

## 6. Out of Scope for This Plan

- Changing **per-chunk** hybrid pipeline to job-level (e.g. one big clustering over all chunks) is a larger refactor; we achieve one-per-incident at **aggregation** and **presentation** instead.
- Glossary vs AI merging (e.g. one canonical for “كذاب” from both sources) is already partially handled by overlap clustering; we can refine overlap or merge rules in a later iteration.
- Changing decision logic (PASS/REJECT) from severity counts; we only change what we **count** (canonical count) and what we **show** (canonical cards).

---

## 7. Success Criteria (Checklist)

- [ ] Report view shows **one card per unique incident**; the same snippet does not appear under multiple articles.
- [ ] Each card shows **المادة الأساسية** and **مواد مرتبطة**; primary is not 4 or 5 when a more specific article applies.
- [ ] Top-level **مخالفات** count equals the number of canonical findings (unique incidents).
- [ ] PDF export matches: one finding per incident, primary + related articles.
- [ ] (After 3.5) When the script summary says “سياق درامي نفسي وليس تحريضي”, findings that are clearly delusional/dialogue show as needs_review or lower severity where appropriate.

Once this plan is agreed, implementation can proceed in the order above.
