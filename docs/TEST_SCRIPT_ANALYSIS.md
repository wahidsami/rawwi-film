# Test Script Analysis - "وحيد أبو نغم (الجزء الرابع)"

## Script Content Summary:
A thriller/drama about Waheed Abu Nagham who leaks company documents after being called a fraud ("نصاب"). The story involves corporate espionage, data leaks, and revenge.

---

## Expected Violations (What AI Should Detect):

### 🚨 VIOLATION #1: Insult/Defamation (نصاب)

**Location:** المشهد 4

**Evidence:**
```
وحيد يتحدث لنفسه.

وحيد
ثلاث سنوات من العمل…
وفي النهاية قالوا:
أنت مجرد نصاب.
```

**Expected Finding:**
- **Article ID**: 5 (الكرامة الإنسانية) or 4 (اللغة والألفاظ)
- **Severity**: high (if in glossary) or medium-high
- **Confidence**: 1.0 (if "نصاب" is in glossary), or 0.85-0.95 (if detected by AI intelligence)
- **Atom ID**: Depends on article structure
- **Reason**: "نصاب" is an insult/defamation term that attacks personal dignity

**Why it's a violation:**
- Direct insult to character's integrity
- Attacks personal honor/reputation
- Falls under dignity/defamation articles
- Should be detected regardless of context (even in flashback/dialogue)

---

## ✅ Clean Content (No Violations Expected):

### Technical Metadata:
- Scene titles: "المشهد 1", "المشهد 2", etc.
- Duration: "15 دقيقة"
- Genre: "تشويق تقني / دراما / أكشن"
- Stage directions: "داخلي – مقر الشركة – صباح"
- Technical descriptions: "Upload Progress – 65%", "Files Released"

### Neutral Descriptions:
- "الشركة في حالة توتر غير مسبوقة" (tension description)
- "الموظفون يتجمعون أمام الشاشات" (neutral action)
- "تنبيهات أمنية تظهر بشكل متكرر" (system alerts)
- "وحيد يجلس وحده" (neutral description)
- "سالم يتجمد" (emotional reaction)

### Story Elements (Not Violations):
- Corporate espionage theme (not promoting crime, just storytelling)
- Data leak plot (technical thriller element)
- Revenge motivation (character psychology)
- Tracking/surveillance (technical security element)

---

## 🎯 AI Detection Test:

### With Current v1.4 MAXIMUM DETECTION Mode:

**Expected Result:**
```json
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-1",
      "title_ar": "استخدام ألفاظ مهينة",
      "description_ar": "استخدام لفظ 'نصاب' وهو لفظ مهين يمس الكرامة الشخصية",
      "severity": "high",
      "confidence": 1.0,
      "is_interpretive": false,
      "evidence_snippet": "وفي النهاية قالوا: أنت مجرد نصاب.",
      "location": {
        "start_offset": [calculated],
        "end_offset": [calculated],
        "start_line": [calculated],
        "end_line": [calculated]
      }
    }
  ]
}
```

---

## 📋 Verification Checklist:

When you test this script:

- [ ] Upload script to system
- [ ] Run analysis
- [ ] Check findings count: Should be **at least 1** (for "نصاب")
- [ ] Verify finding details:
  - [ ] Article ID = 5 or 4
  - [ ] Severity = high or medium
  - [ ] Evidence contains "نصاب"
  - [ ] Confidence = 1.0 (if in glossary) or 0.85+ (if AI detected)
- [ ] Check worker logs for: `Lexicon terms injected into prompts`
- [ ] Verify no false positives on metadata (scene titles, durations, etc.)

---

## 🎯 Summary:

**Expected Violations: 1**
- "نصاب" (insult/defamation)

**Expected Clean Content:**
- All technical metadata
- All neutral descriptions
- All story/plot elements (espionage, leaks, revenge are themes, not violations)

**AI Should:**
- ✅ Detect "نصاب" immediately
- ✅ Flag it as Article 5 (Dignity) or Article 4 (Language)
- ✅ Assign high severity
- ✅ Extract evidence snippet with full sentence
- ❌ NOT flag metadata, scene titles, or neutral descriptions

---

## 🔍 Why Only 1 Violation?

The script is relatively clean except for the single insult. It contains:
- No violence descriptions
- No sexual content
- No drug/alcohol references
- No discrimination
- No incitement
- No other insults or profanity

The "نصاب" insult is the only clear violation that should be detected.
