# Multi-Pass v2.0 Deployment Checklist

## 📋 Pre-Deployment

- ✅ Code changes complete
- ✅ All 10 scanners implemented
- ✅ Documentation updated
- ✅ Changes committed to Git
- ✅ Changes pushed to GitHub
- ✅ Database schema verified (no migrations needed)

---

## 🚀 Deployment Steps

### **1. Coolify Auto-Deploy** ⏳
**Status:** Waiting for Coolify to detect GitHub push

**What Happens:**
- Coolify monitors GitHub repository
- Detects new commit: `fc05d00`
- Pulls latest code
- Rebuilds worker container
- Deploys new version

**Expected Duration:** 5-10 minutes

---

### **2. Verify Deployment** ⏳
**After Coolify completes:**

1. Check worker logs for startup messages
2. Look for: `[multiPassJudge] Running 10 detection passes...`
3. Verify no errors during initialization

---

### **3. Test Analysis** ⏳
**Run a test script analysis:**

1. Create a new script or use existing one
2. Upload a document with known violations
3. Trigger analysis
4. Wait for completion
5. Check findings

**Expected Results:**
- ✅ Glossary terms detected (نصاب, حرامي, etc.)
- ✅ Insults detected
- ✅ Violence detected
- ✅ Sexual content detected
- ✅ Drugs/alcohol detected
- ✅ Discrimination detected
- ✅ National security issues detected
- ✅ Extremism detected
- ✅ Misinformation detected
- ✅ International relations issues detected

---

## 🔍 Monitoring

### **Key Metrics to Watch:**

1. **Detection Rate:**
   - Before: ~60-70%
   - Target: **90-95%**

2. **Processing Time:**
   - Should remain ~3-5 seconds per chunk (parallel execution)

3. **Cost:**
   - Slightly higher (10 AI calls instead of 1)
   - Optimized with gpt-4.1-mini for simple passes

4. **False Negatives:**
   - Before: High (missing نصاب, etc.)
   - Target: **Minimal**

---

## ✅ Success Criteria

### **System is working correctly if:**

1. ✅ All 10 passes execute in parallel
2. ✅ Findings are deduplicated correctly
3. ✅ Glossary terms are detected (نصاب, etc.)
4. ✅ All GCAM articles are covered (4-24)
5. ✅ No crashes or errors in worker logs
6. ✅ Analysis completes successfully
7. ✅ Findings appear in dashboard

---

## 🆘 Rollback Plan

**If issues occur:**

1. Revert to previous commit:
   ```bash
   git revert fc05d00
   git push origin main
   ```

2. Wait for Coolify to redeploy

3. System returns to v1.4 (single-pass)

---

## 📊 Version History

- **v1.0:** Basic AI analysis
- **v1.1:** Router + lexicon injection
- **v1.2:** Judge + lexicon injection
- **v1.3:** STRICT MODE
- **v1.4:** MAXIMUM DETECTION
- **v2.0:** Multi-pass system (6 scanners)
- **v2.1:** Complete GCAM coverage (10 scanners) ← **CURRENT**

---

## 🎯 Next Steps

1. ⏳ Wait for Coolify deployment
2. ⏳ Monitor worker logs
3. ⏳ Test with real scripts
4. ⏳ Verify detection improvements
5. ⏳ Collect feedback from testers

**No SQL scripts to run. System is ready!** 🚀
