# Zero Findings Debug Guide

## 🚨 Issue: Analysis returns 0 findings

### Root Cause Identified:

**`ALWAYS_CHECK_ARTICLES` was missing articles 12-22**

The old value was:
```typescript
[4, 5, 6, 7, 8, 9, 10, 11, 16, 17, 23, 24]
```

This meant:
- Router only selected these articles
- Multi-pass received only these articles
- New passes (6-9) needed articles 12, 13, 14, 15, 18, 19, 20, 21, 22
- Those articles weren't available → passes returned 0 findings

---

## ✅ Fix Applied

Updated `apps/worker/src/gcam.ts`:

```typescript
// Now uses ALL scannable articles dynamically
export const ALWAYS_CHECK_ARTICLES = getScannableArticleIds();
```

This returns: `[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]`

---

## 🔍 Verification Steps

### **1. Check Worker Logs**

Look for these log messages:

```
[multiPassJudge] Starting multi-pass detection
  - passCount: 10
  - lexiconTermsCount: X

[multiPassJudge] Pass glossary completed
  - findingsCount: X
  - duration: X

[multiPassJudge] Pass insults completed
  - findingsCount: X
  - duration: X

... (for all 10 passes)

[multiPassJudge] Multi-pass detection completed
  - totalFindings: X
  - afterDedup: X
  - dropped: X
```

### **2. Check for Errors**

Look for:
```
[multiPassJudge] Pass X failed
  - error: ...
```

Or:
```
No articles for pass X
  - articleIds: [...]
```

### **3. Check Router Output**

Look for:
```
Articles selected for Multi-Pass Judge
  - count: X
  - ids: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
```

**If the ids list is missing 12-22, the fix hasn't deployed yet.**

---

## 🐛 Other Possible Causes

### **Cause 1: No Lexicon Terms in Database**

**Symptom:** Pass 0 (Glossary) returns 0 findings

**Check:**
```sql
SELECT COUNT(*) FROM slang_lexicon WHERE is_active = true;
```

**Fix:** Add glossary terms:
```sql
INSERT INTO slang_lexicon (
  term, normalized_term, term_type, category, 
  severity_floor, enforcement_mode, gcam_article_id, 
  gcam_atom_id, is_active
) VALUES
  ('نصاب', 'نصاب', 'word', 'insult', 'high', 'mandatory_finding', 5, '5-2', true),
  ('حرامي', 'حرامي', 'word', 'insult', 'high', 'mandatory_finding', 5, '5-2', true),
  ('كذاب', 'كذاب', 'word', 'insult', 'medium', 'mandatory_finding', 5, '5-2', true);
```

---

### **Cause 2: OpenAI API Issues**

**Symptom:** All passes return 0 findings, no errors in logs

**Check worker logs for:**
```
OpenAI API error
Rate limit exceeded
Timeout
```

**Fix:** Check OpenAI API key, quota, and connectivity

---

### **Cause 3: Text Chunking Issues**

**Symptom:** Analysis completes but 0 findings

**Check:**
```
Chunk processing started
  - chunkId: X
  - chunkStart: 0
  - chunkEnd: X
  - textLength: X
```

**If textLength = 0**, the script text wasn't extracted properly.

---

### **Cause 4: Findings Filtered Out**

**Symptom:** Multi-pass returns findings, but they disappear

**Check logs for:**
```
Multi-pass detection stats
  - beforeVerbatim: 10
  - afterVerbatim: 0
  - dropped: 10
```

**This shouldn't happen** (verbatim filter is relaxed), but if it does:
- Check `isVerbatim` function in `pipeline.ts`
- Check `enforceAtomIds` function

---

## 🎯 Quick Diagnostic

Run this query to check if findings are being created:

```sql
SELECT 
  af.id,
  af.article_id,
  af.severity,
  af.evidence_snippet,
  aj.status as job_status,
  aj.created_at
FROM analysis_findings af
JOIN analysis_jobs aj ON af.job_id = aj.id
ORDER BY aj.created_at DESC
LIMIT 10;
```

**If no rows:** Findings aren't being created at all
**If rows exist:** Findings are created but not showing in UI

---

## 🚀 Expected After Fix

After deploying the `ALWAYS_CHECK_ARTICLES` fix:

1. ✅ Router selects all 21 articles (4-24)
2. ✅ All 10 passes have articles to scan
3. ✅ Pass 0 (Glossary) detects "نصاب"
4. ✅ Pass 1 (Insults) also detects "نصاب"
5. ✅ Deduplication keeps highest confidence
6. ✅ Finding appears in dashboard

---

## 📝 Deployment Status

**Commits:**
- `fc05d00`: Added 4 new passes (6-9)
- `277a69f`: Added deployment docs
- **NEXT**: Fix `ALWAYS_CHECK_ARTICLES` (pending commit)

**Action:** Push the `ALWAYS_CHECK_ARTICLES` fix to GitHub!
