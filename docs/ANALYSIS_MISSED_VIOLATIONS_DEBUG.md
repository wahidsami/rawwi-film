# Why did analysis only report 1 violation for "ظِلّ المدينة"?

## Script content (expected violations)

The script contains many clear violations that should be flagged:

| Scene / Location | Expected violations | Notes |
|------------------|---------------------|--------|
| المشهد 1 | مادة 6 (حماية الطفل), مادة 9 (عنف), مادة 7 (حقوق المرأة) | فهد يدفع سامي، تهديد الجزمة، "اسكتي"، "إذا رفعتِ صوتك بقوم اخذ الجزمة و اضربك فيها" — **this is the one that was reported** |
| المشهد 1 | مادة 5/7/17 (إهانة، كرامة) | "عديم التربية"، "يا بنت…" |
| المشهد 2 | مادة 6، مادة 9 | معلم: "العن أمك"، "حضربك لين اسيل دمك"، "باضربك"، إيذاء طفل |
| المشهد 3 | مادة 9، مادة 7 | "الرجال اللي يضرب… اليوم يضرب، بكرة يقتل"، "خذيلك شبو" (دواء) |
| المشهد 4 | مادة 8، مادة 14، مادة 16 | "حرامية"، "طز فيكم شوية كلاب و انجاس"، تحريض، إشاعات |
| المشهد 5 | مادة 7، مادة 9، مادة 17 | "انتي ملك هنا"، "مكانك المطبخ و السرير"، "و الله بقتلك"، إمساك الذراع |
| المشهد 6 | مادة 9، مادة 7 | "اسكتي يا حمارة"، "اخذ الجزمة و اضربك بها" |
| المشهد 7 | مادة 6، مادة 9، مادة 8 | معلم يمسك أذن سامي، "مكان البنت… المطبخ و بس" |
| المشهد 8 | مادة 17، مادة 6 | "حشرية"، تهديد، إهمال بلاغ |
| المشهد 9 | مادة 11، مادة 14، مادة 16 | تسجيل تحريض، "أوامر سرية"، "كذب في كذب" |
| المشهد 10 | مادة 9، مادة 7 | "بضرب سامي بعصى على راسه"، "بقتلك" |
| المشهد 11 | مادة 14، مادة 8 | "طز فيهم"، "المدينة تحترق" |
| المشهد 12 | مادة 6، مادة 9 | "عنفني و ضربني و عورني فراسي" |
| المشهد 13 | مادة 8، مادة 14، مادة 16 | "يلعن امها دولة"، "كلهم كذابين و حرامية"، "فوق القانون" |
| المشهد 14–15 | مادة 6، سياق | عنف، بلاغ، نهاية مفتوحة |

So the analysis **should** have reported many more than 1 violation.

---

## How analysis works (reminder)

1. **Chunking** (when job is created): Normalized script is split into chunks of **12,000 characters** with **800** overlap. Long scripts produce **multiple chunks**.
2. **Per chunk**:
   - **Router** (or HIGH_RECALL bypass): Decides which articles to check. Default: Router returns up to **8** candidates; these are **merged with ALWAYS_CHECK_ARTICLES** (all scannable 1–24), then **capped at 25**.
   - **Multi-pass Judge**: Runs 6 passes (glossary, insults, violence, sexual, drugs, discrimination/incitement). **Only articles that are both in the pass and in the selected list** are used. So if the Router did not include an article in the selected list for that chunk, that pass may run with **no articles** and return nothing.
   - **Verbatim**: Findings are kept (we no longer drop on mismatch, but we log).
   - **Dedupe + overlap**: Collapse duplicates.
   - **Upsert** into `analysis_findings`.
3. **Aggregation**: After all chunks are done, findings are clustered into canonical findings and the report is built.

So the main suspects for “only 1 violation” are:

- **Only one chunk was processed** (e.g. second chunk failed or was never run).
- **Router selected too few articles for chunk 2 (and later chunks)** so that violence/insults/woman/child passes had no articles and returned nothing.
- **Judge returned few or no findings** for other chunks (model behaviour, or chunk text different from what we expect).

---

## What to do

### 1. Confirm chunk count and status

Call (with auth):

```http
GET /tasks?jobId=<JOB_ID>&chunks=true
```

Check:

- How many chunks exist for this job.
- Whether all chunks have `status: "done"`. If any chunk is `pending` or `failed`, only the completed chunks contributed findings.

If a chunk is `failed`, check worker logs for that `chunk_id` (e.g. "Multi-pass detection failed", timeout, or API error).

### 2. Enable high recall (recommended)

To remove the Router as a variable and always judge **all** articles on **every** chunk, set:

```bash
WORKER_HIGH_RECALL=true
```

Then restart the worker and **re-run analysis** on the same script (new job). No code change; this is already supported.

- **Effect**: Router is skipped; every chunk is analyzed against all 25 articles. You should see more violations for scripts like "ظِلّ المدينة".
- **Cost**: More articles per chunk → more tokens and a bit more latency. Acceptable for production if you want maximum recall.

### 3. Optional: increase router candidates

If you prefer to keep using the Router but want it to suggest more articles, you can raise the candidate cap (e.g. in config or env) from **8** to **12** or **15**. This only helps if the issue is “Router didn’t suggest 6/7/8/9 for chunk 2”. With `ALWAYS_CHECK_ARTICLES` already including all scannable articles, the merge often already reaches 25; the main fix is **HIGH_RECALL** so that every chunk is guaranteed to be checked against all articles.

### 4. Re-run and compare

After setting `WORKER_HIGH_RECALL=true` and re-running:

- Check again `GET /tasks?jobId=<NEW_JOB_ID>&chunks=true`.
- Open the new report: you should see multiple violations across مادة 6، 7، 8، 9، 11، 14، 16، etc., for the scenes above.

---

## Summary

- **Yes, the analysis failed to pick almost all violations** in this script; only one (مادة 6 in المشهد 1) was reported.
- Most likely causes: **Router not selecting enough articles for some chunks**, and/or **only one chunk being processed** (others pending/failed).
- **Recommended fix:** Set **`WORKER_HIGH_RECALL=true`** and re-run analysis so every chunk is judged against all articles. Then verify with the chunk-status API and the new report.
