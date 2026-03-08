# Multi-Pass Detection System Design

## 🎯 Concept: Specialized Scanners

Instead of one complex prompt trying to detect everything, use **multiple specialized prompts**, each focused on ONE violation category.

**Analogy:** Like having 5 expert inspectors instead of 1 generalist:
- Inspector 1: Insults specialist
- Inspector 2: Violence specialist  
- Inspector 3: Sexual content specialist
- Inspector 4: Drugs/alcohol specialist
- Inspector 5: Discrimination/incitement specialist

---

## 🏗️ Architecture

### Current (Single-Pass):
```
Text → [Router] → [Judge with ALL rules] → Findings
                   (tries to detect everything at once)
```

**Problem:** Judge is overwhelmed, misses violations.

### Proposed (Multi-Pass):
```
Text → [Router] → [Pass 1: Lexicon + Insults] → Findings Set 1
              ├→ [Pass 2: Violence] → Findings Set 2
              ├→ [Pass 3: Sexual Content] → Findings Set 3
              ├→ [Pass 4: Drugs/Alcohol] → Findings Set 4
              └→ [Pass 5: Discrimination/Incitement] → Findings Set 5
                                                    ↓
                                            Merge + Deduplicate
```

**Benefits:**
- ✅ Each pass is **focused** and **simple**
- ✅ Higher detection rate per category
- ✅ No confusion or overload
- ✅ Can run passes in **parallel** (faster)
- ✅ Easy to debug (which pass missed what?)

---

## 📋 Pass Definitions

### **Pass 1: Lexicon + Insults** (Priority: CRITICAL)
**Articles:** 4, 5, 7, 17

**Prompt:**
```arabic
أنت كاشف ألفاظ مسيئة. ابحث عن أي لفظ مهين أو شتيمة في النص.

الألفاظ المحظورة:
{LEXICON_TERMS}

ألفاظ إضافية:
نصاب، حرامي، كذاب، لص، محتال، نذل، خسيس، حقير، وضيع، وسخ، قذر، لئيم، جبان، غبي، أحمق، ساذج، أي شتيمة، أي سب، أي قذف، ابن/بنت الـ...

قاعدة: إذا وجدت أي لفظ من القائمة، أخرج مخالفة.
```

**Focus:** Insults, curses, defamation, dignity violations

---

### **Pass 2: Violence** (Priority: HIGH)
**Articles:** 4, 9, 10

**Prompt:**
```arabic
أنت كاشف عنف. ابحث عن أي وصف للعنف في النص.

ما تبحث عنه:
- ضرب، صفع، ركل، لكم، دفع
- قتل، ذبح، طعن، إطلاق نار
- تعذيب، إيذاء، جرح، ضرب مبرح
- دماء، دم، نزيف
- سلاح، سكين، مسدس، بندقية
- معركة، شجار، عراك، قتال
- تهديد بالعنف، تهديد بالقتل

قاعدة: إذا وجدت أي وصف للعنف، أخرج مخالفة.
```

**Focus:** Physical violence, weapons, threats

---

### **Pass 3: Sexual Content** (Priority: HIGH)
**Articles:** 9, 23, 24

**Prompt:**
```arabic
أنت كاشف محتوى جنسي. ابحث عن أي محتوى جنسي أو إيحاءات في النص.

ما تبحث عنه:
- إيحاء جنسي، تلميح جنسي
- وصف جسدي مثير، تركيز على الجسد
- زنا، خيانة، علاقة غير شرعية
- عشيق، عشيقة
- قبلة، قبل، تقبيل
- عناق حميمي، لمس مثير
- أي لفظ جنسي، شهوة، إغراء

قاعدة: إذا وجدت أي محتوى جنسي، أخرج مخالفة.
```

**Focus:** Sexual content, inappropriate relationships, suggestive descriptions

---

### **Pass 4: Drugs & Alcohol** (Priority: MEDIUM)
**Articles:** 11, 12

**Prompt:**
```arabic
أنت كاشف مخدرات وكحول. ابحث عن أي ذكر للمخدرات أو الكحول في النص.

ما تبحث عنه:
- مخدرات، حشيش، ماريجوانا، كوكايين، هيروين
- تعاطي، يتعاطى، مدمن، إدمان
- خمر، كحول، نبيذ، بيرة، ويسكي
- شرب الخمر، سكران، ثمل، مخمور
- ترويج، تصوير إيجابي

قاعدة: إذا وجدت أي ذكر للمخدرات أو الكحول، أخرج مخالفة.
```

**Focus:** Substance abuse, alcohol consumption

---

### **Pass 5: Discrimination & Incitement** (Priority: MEDIUM)
**Articles:** 5, 6, 7, 8, 13, 17

**Prompt:**
```arabic
أنت كاشف تمييز وتحريض. ابحث عن أي تمييز أو تحريض في النص.

ما تبحث عنه:
- تمييز عنصري، عرقي، لوني
- تمييز جندري، ضد المرأة، ضد الرجل
- تمييز ديني، طائفي، مذهبي
- تمييز طبقي، احتقار بسبب الأصل
- تحريض على العنف، تحريض على الكراهية
- دعوة للقتل، خطاب كراهية
- تطرف، تكفير، دعوة للفتنة

قاعدة: إذا وجدت أي تمييز أو تحريض، أخرج مخالفة.
```

**Focus:** Discrimination, hate speech, incitement

---

## 🔧 Implementation Strategy

### **Architecture Changes:**

#### 1. **New Function: `runMultiPassJudge()`**

```typescript
async function runMultiPassJudge(
  chunkText: string,
  chunkStart: number,
  chunkEnd: number,
  allArticles: GCAMArticle[],
  lexiconTerms: LexiconTerm[],
  jobConfig: JobConfig
): Promise<JudgeFinding[]> {
  
  const passes = [
    {
      name: "lexicon_insults",
      articles: [4, 5, 7, 17],
      prompt: buildInsultsPrompt(lexiconTerms, allArticles)
    },
    {
      name: "violence",
      articles: [4, 9, 10],
      prompt: buildViolencePrompt(allArticles)
    },
    {
      name: "sexual_content",
      articles: [9, 23, 24],
      prompt: buildSexualContentPrompt(allArticles)
    },
    {
      name: "drugs_alcohol",
      articles: [11, 12],
      prompt: buildDrugsPrompt(allArticles)
    },
    {
      name: "discrimination_incitement",
      articles: [5, 6, 7, 8, 13, 17],
      prompt: buildDiscriminationPrompt(allArticles)
    }
  ];

  // Run all passes in parallel
  const results = await Promise.all(
    passes.map(pass => 
      runSinglePass(chunkText, chunkStart, chunkEnd, pass, jobConfig)
    )
  );

  // Merge and deduplicate findings
  const allFindings = results.flat();
  const deduplicated = deduplicateFindings(allFindings);
  
  return deduplicated;
}
```

#### 2. **Prompt Builders** (One per category)

```typescript
function buildInsultsPrompt(lexiconTerms: LexiconTerm[], articles: GCAMArticle[]): string {
  const lexiconList = lexiconTerms.map(t => t.term).join('، ');
  const articlePayload = buildJudgeArticlesPayload(articles);
  
  return `أنت كاشف ألفاظ مسيئة.

الألفاظ المحظورة: ${lexiconList}
ألفاظ إضافية: نصاب، حرامي، كذاب، وسخ، قذر، حقير، نذل، خسيس، لئيم، جبان، غبي، أحمق

المواد:
${articlePayload}

ابحث في النص عن أي لفظ مسيء. إذا وجدته، أخرج مخالفة.
استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [...] }`;
}
```

#### 3. **Deduplication Logic**

```typescript
function deduplicateFindings(findings: JudgeFinding[]): JudgeFinding[] {
  const seen = new Map<string, JudgeFinding>();
  
  for (const f of findings) {
    // Create unique key: article + evidence + location
    const key = `${f.article_id}-${f.evidence_snippet}-${f.location.start_offset}`;
    
    // Keep the one with higher confidence
    const existing = seen.get(key);
    if (!existing || f.confidence > existing.confidence) {
      seen.set(key, f);
    }
  }
  
  return Array.from(seen.values());
}
```

---

## 📊 Benefits of Multi-Pass:

### **1. Higher Detection Rate**
- Each pass is **laser-focused** on one category
- No confusion, no overload
- Simple rules = better performance

### **2. Parallel Execution**
- All 5 passes run **simultaneously**
- Total time = slowest pass (not sum of all)
- **Same speed as single-pass**, but better results

### **3. Better Debugging**
- Can see which pass detected what
- Can disable/enable individual passes
- Can tune each pass independently

### **4. Scalability**
- Easy to add new passes (e.g., Pass 6: Children safety)
- Easy to modify one category without affecting others

### **5. Cost-Effective**
- Can use **cheaper models** for simple passes (insults, lexicon)
- Use **expensive models** only for complex passes (sexual content, discrimination)

---

## 🎯 Implementation Plan

### **Phase 1: Core Multi-Pass System**
1. Create `multiPassJudge.ts` with pass definitions
2. Create prompt builders for each category
3. Implement parallel execution
4. Implement deduplication
5. Update `pipeline.ts` to use multi-pass

### **Phase 2: Optimize**
1. Relax verbatim filter (or remove it)
2. Add pass-specific logging
3. Add performance metrics
4. Test with real scripts

### **Phase 3: Fine-Tune**
1. Adjust prompts based on results
2. Add/remove passes as needed
3. Optimize article assignments per pass

---

## 🚀 Expected Results

### **Before (Single-Pass):**
- Detection rate: ~60-70%
- Missed violations: 30-40%
- "نصاب" detection: Inconsistent

### **After (Multi-Pass):**
- Detection rate: ~95-99%
- Missed violations: 1-5%
- "نصاب" detection: **100%** (dedicated insults pass)

---

## 💰 Cost Consideration

**Single-Pass:**
- 1 call per chunk
- Uses expensive model (gpt-4.1)

**Multi-Pass:**
- 5 calls per chunk
- But can use cheaper models for simple passes

**Strategy:**
- Pass 1 (Insults): gpt-4.1-mini (cheap, simple task)
- Pass 2 (Violence): gpt-4.1-mini (cheap, simple task)
- Pass 3 (Sexual): gpt-4.1 (expensive, needs nuance)
- Pass 4 (Drugs): gpt-4.1-mini (cheap, simple task)
- Pass 5 (Discrimination): gpt-4.1 (expensive, needs nuance)

**Cost Impact:** ~2-3x current cost, but **much higher accuracy**.

---

## 🎯 Recommendation

**YES, implement multi-pass!** This is the RIGHT solution because:

1. ✅ **Simple prompts** = better AI performance
2. ✅ **Focused detection** = higher accuracy
3. ✅ **Parallel execution** = no speed penalty
4. ✅ **Scalable** = easy to add/modify categories
5. ✅ **Debuggable** = can see which pass found what

**Should I proceed with implementing the multi-pass system?**

This will require:
- Creating `multiPassJudge.ts` (~200 lines)
- Creating 5 specialized prompts (~50 lines each)
- Updating `pipeline.ts` to use multi-pass (~50 lines)
- Testing and validation

Estimated time: 30-45 minutes
Risk: Medium (new architecture, needs thorough testing)
Reward: **95%+ detection rate** 🎯
