# Analysis enhancement plan — speed, rationale quality, multi-pass strategy

**Scope:** `apps/worker` (primary), Edge `extract`/`tasks` (chunk creation), optional ops (replicas).  
**Goals:** (1) reduce wall-clock analysis time, (2) fix weak or nonsensical violation explanations, (3) optimize the **multi-pass-per-chunk** design without exploding cost.

---

## Current architecture (baseline)

| Layer | Role |
|-------|------|
| **Router** | `callRouter` — selects candidate articles (`gpt-4.1-mini` by default). |
| **Multi-pass judge** | `runMultiPassDetection` in `multiPassJudge.ts` — **10** `DETECTION_PASSES` in **parallel** (`Promise.all`). |
| **Hybrid (optional)** | `ANALYSIS_ENGINE=hybrid` → `runHybridContextPipeline` + `runDeepAuditorPass` (extra LLM + rationale batches). |
| **Chunk execution** | `apps/worker/src/index.ts` — **one chunk** processed per loop iteration **per worker process**; `claimChunk` is safe for multiple workers. |
| **Persistence** | `analysis_findings` with `title_ar`, `description_ar`, `rationale_ar`, `location`, etc. |

**Rationale / “why violation”** is produced in:

- Judge prompts (`multiPassJudge.ts`, `aiConstants.ts` excerpts) — `description_ar`, `title_ar`, and (when hybrid) `rationale_ar`.
- Auditor path (`deepAuditor.ts`) — can override or fill `rationale_ar`; default placeholder text if weak.
- `findingTitleNormalize.ts` — fixes **misused glossary** titles only.

**Schema** (`schemas.ts`): `rationale_ar` is **optional** in Zod → empty strings can slip through; downstream merges weak text with defaults.

---

## Goal 1 — Reduce analysis time

### 1.1 Highest leverage (ops, no code)

| Action | Effect |
|--------|--------|
| Run **2+ worker replicas** (Coolify / separate processes) | Near-linear throughput until **OpenAI RPM/TPM** caps. |
| Monitor **429 / retries** in OpenAI dashboard | Tune concurrency or upgrade tier. |

### 1.2 Code / config (lower risk)

| Item | Location | Note |
|------|----------|------|
| `ANALYSIS_CHUNK_BY_PAGE` | Edge `extract` / `tasks` env | **Per-page** chunks → many chunks; keep **off** unless product requires page-aligned chunks. |
| Chunk size / overlap | `supabase/functions/_shared/utils.ts` `chunkText` defaults | Larger chunks → **fewer** chunks, **longer** prompts — trade latency vs. memory. |
| `force_fresh` in jobs | `config_snapshot` | Avoid unnecessary cache bypass. |
| `HIGH_RECALL` | `WORKER_HIGH_RECALL` | Dev-only; **never** in prod for speed. |

### 1.3 Code (medium effort)

| Item | Idea |
|------|------|
| **Optional bounded parallelism inside worker** | Process **2 pending chunks** at a time (same process) with `Promise.all` + semaphore — **doubles** OpenAI pressure; use only if replicas are not an option. |
| **Router + passes overlap** | Not recommended to merge without measurement; router is cheap vs judge. |

**Success metric:** median **seconds per chunk** × job chunk count; track **OpenAI 429 rate**.

### Operations checklist (apply in deployment)

| Check | Notes |
|-------|--------|
| Worker replicas | Prefer **2+** independent worker processes until OpenAI RPM/TPM caps; scales chunk throughput safely with `claimChunk`. |
| `ANALYSIS_CHUNK_BY_PAGE` | Keep **off** unless scripts must be chunked by page (fewer chunks = faster jobs). |
| `force_fresh` / `forceFresh` | Use only when bypassing [`analysis_chunk_runs`](apps/worker/src/pipeline.ts) cache is intentional. |
| `WORKER_HIGH_RECALL` | **Never** in production (dev-only; uses all articles, much slower). |
| OpenAI dashboard | Watch **429** and retry spikes; tune replicas or tier before adding in-process multi-chunk parallelism. |

---

## Goal 2 — Fix nonsensical “why violation” text

### 2.1 Root causes observed in code

1. **Weak or empty `rationale_ar` / `description_ar`** — schema allows defaults; hybrid auditor may fill generic placeholder (`"يتطلب تقييم مراجع مختص."`).
2. **Title leakage** from glossary pass — partially handled by `normalizeMisusedGlossaryPassTitle`.
3. **Model output** not grounded in **scene role** (dialogue vs narrative) despite prompt instructions in `aiConstants.ts`.

### 2.2 Recommendations (phased)

| Phase | Change |
|-------|--------|
| **A — Validation** | Post-parse gate: if `rationale_ar` length &lt; N **or** matches generic patterns → **flag** `needs_review` or trigger **single** mini “explain” call with **chunk + evidence slice only** (no full 25 articles). |
| **B — Schema** | Require `description_ar` min length for **persisted** violations (or store `rationale_quality: low` in `location` for UI). |
| **C — Auditor gating** | Run **rationale-only** pass (`callRationaleOnly`) only for **violation** rulings with short rationale (already partially in `deepAuditor.ts`). |
| **D — Prompt** | Per-pass **one-line template**: “الجملة: [اقتباس] — السياق: [حوار/سرد] — السبب: [رابط بالمادة]” in `build*Prompt` for top-error passes. |

**Success metric:** % of findings with `rationale_ar` length &gt; 80 chars; **human spot-check** on 20 random findings per release.

---

## Goal 3 — Best approach for multi-passes per chunk

### 3.1 What you have today

- **10 passes** in parallel (`DETECTION_PASSES`): glossary, insults, violence, sexual_content, drugs, discrimination, national_security, extremism, misinformation, international_relations.
- **Different models per pass** (`gpt-4.1-mini` vs `gpt-4.1`) — good cost/speed split; wall time ≈ **slowest** pass in the batch (unless rate-limited).

### 3.2 Strategy options

| Strategy | Pros | Cons |
|----------|------|------|
| **Keep 10 parallel** | Max coverage per chunk | **10×** judge pressure on API; redundant overlap between passes. |
| **Merge related passes** | Fewer calls; faster | Larger prompts; harder to tune; may mix concerns. |
| **Two-stage** | Stage 1: **cheap** screen (mini + few articles); Stage 2: **full** pass only if flags | **Lower average cost**; more complex. |
| **Router-driven passes** | Run only passes relevant to **router candidates** + ALWAYS_CHECK | **Fewer** calls when router is narrow; **must** keep always-on rules (lexicon, violence baseline) per product policy. |

### 3.3 Recommended direction (incremental)

1. **Measure** per-pass `duration` and **findings count** per pass (already logged in `multiPassDetection` → `passResults`). Identify **low-yield** passes.
2. **Router-gated passes** (careful): after router, skip passes whose **article sets** don’t intersect `selectedIds ∪ ALWAYS_CHECK_ARTICLES` (with tests for **lexicon** and **mandatory** articles).
3. **Do not** reduce parallel passes without **A/B** on recall — **regulatory** risk.

**Success metric:** average **LLM seconds per chunk**; **recall** on golden scripts (same as QA checklist).

---

## Implementation order (suggested)

1. **Week 1 — Ops:** 2 worker replicas + dashboards (OpenAI + Supabase).  
2. **Week 1 — Instrumentation:** log `passResults` duration percentiles to structured logs (or table) for one job type.  
3. **Week 2 — Rationale:** Phase A validation + optional mini explain; tighten `title_ar`/`description_ar` for persist.  
4. **Week 3+ — Multi-pass:** router-gated pass execution behind feature flag; golden-script regression.

---

## References (code)

- `apps/worker/src/index.ts` — chunk loop  
- `apps/worker/src/jobs.ts` — `claimChunk`  
- `apps/worker/src/multiPassJudge.ts` — `DETECTION_PASSES`, `runMultiPassDetection`  
- `apps/worker/src/pipeline.ts` — `processChunkJudge`, hybrid branch  
- `apps/worker/src/methodology-v3/deepAuditor.ts` — auditor + rationale batches  
- `apps/worker/src/findingTitleNormalize.ts` — glossary title fix  
- `apps/worker/src/schemas.ts` — `judgeFindingSchema`  
- `supabase/functions/_shared/utils.ts` — `chunkText` defaults  

---

*Document status: planning — not implementation commitment.*
