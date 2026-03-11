# Script Analysis Feature — Technical Report

**Project:** Film Saudi / هيئة الأفلام السعودية  
**Report Date:** March 11, 2025  
**Scope:** Script analysis feature — AI, pipeline, prompts, and dependencies

---

## 1. Executive Summary

The system includes a script analysis feature that evaluates film scripts on **story quality** and **compliance with Saudi laws and norms**. It uses **Google Gemini AI** (Gemini 2.5 Pro) when configured, with a fallback to mock analysis. The analysis is based on criteria aligned with the Saudi Film Commission (هيئة الأفلام السعودية).

---

## 2. AI Model Used

| Attribute | Value |
|-----------|-------|
| **Primary AI** | Google Gemini 2.5 Pro |
| **API Endpoint** | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent` |
| **API Key** | `VITE_GEMINI_API_KEY` (from `.env`) |
| **Fallback** | Mock analysis when API key is missing or API fails |

**Configuration check:** `isGeminiConfigured()` in `src/utils/ai/gemini-enhanced.ts` checks for a non-empty API key.

**Alternative (legacy):** `gemini.ts` uses **Gemini 2.5 Flash** (`gemini-2.5-flash`) for a simpler analysis flow; the main script analysis uses the enhanced Gemini Pro flow.

---

## 3. Pipeline Overview

### 3.1 High-Level Flow

```
User (Add Script) → Step 1: Form (metadata) → Step 2: Script Text → [تحليل النص] → AI/Mock → DB → Assessment Page
```

### 3.2 Detailed Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. USER INPUT                                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ • AddScript.tsx (Step 1): title, synopsis, genre, type, duration, rating         │
│ • createScript() → Supabase scripts table                                        │
│ • createdScriptId stored in state                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 2. SCRIPT CONTENT (Step 2)                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ • ScriptTextEditor component                                                     │
│ • Sources: paste, type, or import from Word (.docx via mammoth)                 │
│ • Minimum length: 100 characters                                                 │
│ • Output: plain text (getText()) + HTML (getHTML())                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 3. ANALYSIS TRIGGER (handleAnalyzeScript)                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ • AddScript.tsx → handleAnalyzeScript(scriptText, htmlContent)                   │
│ • Text truncation: max 500,000 chars (truncated with notice if longer)           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 4. AI / MOCK BRANCH                                                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│ IF isGeminiConfigured():                                                         │
│   → analyzeScriptEnhanced(truncatedText, metadata)                               │
│   → On failure: fallback to generateMockEnhancedAnalysis()                        │
│ ELSE:                                                                            │
│   → generateMockEnhancedAnalysis(metadata)                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 5. PERSISTENCE                                                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ • updateScript(createdScriptId, { script_content, script_content_html })          │
│ • createEnhancedScriptAnalysis(createdScriptId, analysisResult)                  │
│   - script_analyses (overall + story quality scores + summary)                   │
│   - compliance_analysis (21 factors)                                             │
│   - script_issues (per-issue records)                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 6. DISPLAY                                                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ • ScriptAssessmentEnhanced.tsx                                                   │
│ • getEnhancedScriptAnalysis(scriptId) → joins script_analyses, compliance, issues  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Files and Roles

| File | Role |
|------|------|
| `src/pages/dashboard/AddScript.tsx` | Wizard UI, triggers analysis, saves results |
| `src/components/ScriptTextEditor.tsx` | Text input (paste/import), calls `onAnalyze` |
| `src/utils/ai/gemini-enhanced.ts` | Main AI logic, prompt, mock generator |
| `src/utils/ai/gemini.ts` | Legacy Gemini Flash analysis (not used for main flow) |
| `src/utils/supabase/scripts.ts` | `createEnhancedScriptAnalysis`, `getEnhancedScriptAnalysis` |
| `src/utils/files/textExtractor.ts` | PDF/DOCX extraction (prepared, not used in current flow) |
| `src/pages/dashboard/ScriptAssessmentEnhanced.tsx` | Renders analysis results |

---

## 5. The Analysis Prompt

### 5.1 Location

`src/utils/ai/gemini-enhanced.ts` — constant `ENHANCED_ANALYSIS_PROMPT` (lines 121–356).

### 5.2 Complete Prompt (Full Text)

````
أنت محلل نصوص سينمائية متخصص في تقييم النصوص وفقاً لمعايير هيئة الأفلام السعودية.

قم بتحليل النص السينمائي التالي بشكل شامل ومفصل.

═══════════════════════════════════════════════════════════════════
القسم الأول: تقييم جودة القصة (Story Quality Evaluation)
═══════════════════════════════════════════════════════════════════

قيّم النص على أربعة معايير رئيسية. لكل معيار، أعط:
1. درجة من 0-100
2. شرح للدرجة (ماذا تخبرنا الدرجة)

**معايير التقييم:**

1. **قوة الحبكة والتوتر (Plot Strength and Tension)**
   - 0-20: العنصر مفقود، معيب جوهرياً، مربك، أو سيء التنفيذ
   - 21-40: العنصر موجود لكنه ضعيف، مبتذل، أو غير متسق
   - 41-60: العنصر يعمل بفعالية، يظهر كفاءة ويشرك القارئ
   - 61-80: العنصر منفذ بثقة، أصالة، وتأثير عاطفي
   - 81-100: العنصر لا تشوبه شائبة، مبتكر، لا يُنسى

2. **تطور الشخصيات (Character Development)**
   [نفس مقياس التقييم]

3. **الذروة والحل (Climax and Resolution)**
   [نفس مقياس التقييم]

4. **الموضوع الرئيسي (Main Theme)**
   [نفس مقياس التقييم]

═══════════════════════════════════════════════════════════════════
القسم الثاني: تحليل الامتثال للقوانين والأعراف السعودية
═══════════════════════════════════════════════════════════════════

قيّم النص على جميع العوامل التالية. لكل عامل:
1. مستوى المخاطرة: none / low / medium / high
2. التفاصيل: شرح لماذا تم تعيين هذا المستوى

**مهم جداً:**
- إذا وُجد أي من العوامل المدرجة أدناه تم تصويره، الترويج له، أو التغاضي عنه في السرد، يُعيّن مستوى مخاطرة HIGH فوراً

**a. اللياقة العامة والمبادئ الاجتماعية/الدينية:**

1. **unsupervised_mixing (الاختلاط غير الخاضع للإشراف)**
   - المحفز: تصوير ذكور وإناث بالغين غير مرتبطين يتجمعون أو يتواصلون بشكل خاص دون إشراف
   - المخاطرة: HIGH إذا وُجد

2. **pda (إظهار المودة علناً)**
   - المحفز: مشاهد صريحة أو موحية للحميمية، التقبيل، أو الاتصال الجسدي بين أفراد غير متزوجين
   - المخاطرة: HIGH إذا وُجد

3. **improper_attire (ملابس غير لائقة / الحشمة)**
   - المحفز: تصوير شخصيات (خاصة الإناث) ترتدي ملابس كاشفة أو غير محتشمة بشكل صارخ في الأماكن العامة
   - المخاطرة: MEDIUM إذا وُجد

4. **language_dialogue (اللغة والحوار)**
   - المحفز: استخدام التجديف، إشارات جنسية صريحة، أو ألفاظ نابية شديدة
   - المخاطرة: MEDIUM إلى HIGH حسب الشدة

5. **anti_family_values (الترويج لقيم معادية للأسرة/المجتمع)**
   - المحفز: مشاهد تسخر من أهمية الروابط الأسرية، سلطة الوالدين، أو الطقوس الدينية
   - المخاطرة: MEDIUM إذا وُجد

**b. الأنشطة الإجرامية والمحظورة:**

6. **substance_abuse (تعاطي المخدرات)**
   - المحفز: أي تصوير، حتى غير مباشر، لاستهلاك الكحول، المخدرات، أو المواد المخدرة
   - المخاطرة: HIGH (رفض تلقائي)

7. **smuggling (التهريب/التجارة غير المشروعة)**
   - المحفز: تصوير الانخراط في التجارة، التهريب، أو التوزيع في السوق السوداء للسلع المحظورة
   - المخاطرة: HIGH (رفض تلقائي)

8. **defamation (التشهير/القذف)**
   - المحفز: مشاهد تحتوي على التشهير، القذف، أو السخرية من الأفراد، القبائل، الأديان، أو كيانات حكومية محددة
   - المخاطرة: HIGH

9. **cybercrime (الجرائم الإلكترونية/الاحتيال)**
   - المحفز: تعليمات تفصيلية أو تصوير ارتكاب الاحتيال عبر الإنترنت، القرصنة، أو سرقة الهوية
   - المخاطرة: MEDIUM إلى HIGH

10. **violence_extremism (العنف والتطرف)**
    - المحفز: الترويج للإرهاب، التطرف، أو عنف واقعي وصريح/تعذيب
    - المخاطرة: HIGH (رفض تلقائي)

**c. لوائح النظام العام والسلامة:**

11. **unauthorized_assembly (التجمع غير المصرح به)**
    - المحفز: تنظيم تجمعات عامة كبيرة، احتجاجات، أو فعاليات دون تصاريح رسمية
    - المخاطرة: MEDIUM

12. **traffic_violations (انتهاكات قوانين المرور)**
    - المحفز: تصوير واضح للقيادة الخطرة جداً، القيادة بدون رخصة، أو الاستخدام غير المصرح به للممتلكات
    - المخاطرة: MEDIUM

13. **property_damage (تخريب الممتلكات/التخريب)**
    - المحفز: تصوير التخريب، الحريق المتعمد، أو التدمير المتعمد للممتلكات العامة أو الخاصة
    - المخاطرة: MEDIUM

14. **disrespect_law_enforcement (عدم احترام إنفاذ القانون)**
    - المحفز: مشاهد تسخر، تعرقل، أو تصور عمداً ضباط إنفاذ القانون أو ممثلي الحكومة بشكل سلبي أو ازدرائي
    - المخاطرة: MEDIUM

**d. تحليل السلطة وتمثيل النظام:**

15. **law_enforcement_depiction (تصوير إنفاذ القانون)**
    - المحفز: تصوير الشرطة، الهيئات الرسمية، أو الوكلاء الحكوميين كفاسدين، غير أكفاء، خبيثين، أو موضع سخرية
    - المخاطرة: HIGH

16. **evasion_of_law (التهرب المباشر من القانون)**
    - المحفز: إظهار الأبطال ينجحون في التهرب من العواقب القانونية بعد ارتكاب جرائم خطيرة دون القبض عليهم
    - المخاطرة: HIGH

17. **paternal_authority (تصوير السلطة الأبوية)**
    - المحفز: تصوير شخصيات السلطة أو الشخصيات الأبوية كطغاة وقساة بشكل غير عادل، مع الترويج للانفصال الأسري الكامل
    - المخاطرة: MEDIUM

18. **conflict_resolution (حل النزاعات)**
    - المحفز: إظهار النزاعات تُحل من خلال الرشوة، العنف، الفوضى، أو الابتزاز بدلاً من استخدام القنوات القانونية أو الأسرية
    - المخاطرة: MEDIUM

**e. تحليل الرسالة الأخلاقية والخاتمة:**

19. **consequences_of_crime (عواقب الجريمة)**
    - المحفز: البطل المتمرد ينجح أو يحقق هدفه دون دفع ثمن ملموس ومناسب، أو تُبرر أفعاله غير القانونية
    - المخاطرة: HIGH

20. **glamorization (تجميل الخطأ)**
    - المحفز: جعل الشخصيات التي ترتكب الأخطاء جذابة وقابلة للتقليد بشكل كبير، مما يجعل سلوكها المحفوف بالمخاطر جذاباً
    - المخاطرة: MEDIUM

21. **hope_responsibility (رسالة الأمل والمسؤولية)**
    - المحفز: غياب أي رسالة تعزز الندم، المسؤولية، أو التغيير الإيجابي في النتيجة النهائية
    - المخاطرة: متطلب قوي (يجب أن تكون الرسالة إيجابية)

═══════════════════════════════════════════════════════════════════
القسم الثالث: المشاكل المكتشفة (Issues)
═══════════════════════════════════════════════════════════════════

إذا وجدت أي مشاكل من القسمين 1 و 2، أنشئ بطاقة مشكلة لكل واحدة تحتوي على:
- title: عنوان المشكلة بالعربية
- risk_level: none / low / medium / high
- category: أي فئة ('a', 'b', 'c', 'd', 'e')
- excerpt: مقتطف من النص (الفقرة التي تحتوي المشكلة)
- page_number: رقم الصفحة (تقديري إذا لم يكن واضحاً)
- line_start: السطر الابتدائي
- line_end: السطر النهائي
- suggestion: اقتراح لإصلاح المشكلة بالعربية

═══════════════════════════════════════════════════════════════════

**النص المراد تحليله:**

{SCRIPT_TEXT}

**معلومات النص:**
- العنوان: {TITLE}
- النوع: {GENRE}
- المدة المتوقعة: {DURATION} دقيقة
- التصنيف المتوقع: {EXPECTED_RATING}

═══════════════════════════════════════════════════════════════════
القسم الخامس: ملخص القصة للإدارة (Admin Story Summary)
═══════════════════════════════════════════════════════════════════

قم بكتابة ملخص شامل للقصة باللغة العربية (200-300 كلمة) يتضمن:

1. **الموضوع الرئيسي:** ما هي الفكرة الأساسية للقصة؟
2. **الشخصيات الرئيسية:** من هم الأبطال وما هي دوافعهم؟
3. **الحبكة الأساسية:** كيف تتطور الأحداث؟
4. **الرسالة:** ما هي القيم أو الدروس التي تريد القصة إيصالها؟
5. **الجمهور المستهدف:** لمن هذه القصة؟
6. **التقييم العام:** نظرة شاملة على جودة القصة

هذا الملخص مخصص للإدارة لمساعدتها في اتخاذ قرارات سريعة ودقيقة.

═══════════════════════════════════════════════════════════════════

**المطلوب:**

قم بإرجاع تحليل شامل بصيغة JSON يحتوي على:

**مهم جداً:** يجب أن تكون قيمة "severity" واحدة من هذه القيم فقط: "low" أو "medium" أو "high" أو "critical"

```json
{
  "overall_score": 85,
  "severity": "low",
  "predicted_rating": "PG-13",
  "confidence": 0.92,
  "story_quality": {
    "plot_strength_score": 75,
    "plot_strength_explanation": "الحبكة قوية مع توتر جيد...",
    "character_development_score": 80,
    "character_development_explanation": "الشخصيات متطورة بشكل جيد...",
    "climax_resolution_score": 70,
    "climax_resolution_explanation": "الذروة واضحة لكن الحل قد يحتاج تحسين...",
    "main_theme_score": 85,
    "main_theme_explanation": "الموضوع الرئيسي واضح ومؤثر..."
  },
  "compliance": {
    "unsupervised_mixing_risk": "none",
    "unsupervised_mixing_details": "لا يوجد تصوير للاختلاط غير الخاضع للإشراف",
    "... (جميع العوامل الـ 21)"
  },
  "issues": [
    {
      "title": "استخدام ألفاظ غير لائقة في الحوار",
      "risk_level": "low",
      "category": "a",
      "excerpt": "نص الحوار المشكل...",
      "page_number": 12,
      "line_start": 5,
      "line_end": 7,
      "suggestion": "يُنصح باستبدال الألفاظ بكلمات أكثر لطفاً..."
    }
  ],
  "summary": "ملخص شامل للتحليل...",
  "recommendations": ["توصية 1", "توصية 2"],
  "admin_summary": "ملخص القصة للإدارة: تدور القصة حول... (200-300 كلمة)"
}
```

**مهم جداً:**
- قم بإرجاع JSON صالح فقط دون أي نص إضافي
- تأكد من أن جميع النصوص محاطة بعلامات اقتباس مزدوجة
- استخدم \" للاقتباسات داخل النصوص
- استخدم \n للأسطر الجديدة داخل النصوص
- تأكد من تقييم جميع العوامل الـ 21 في قسم compliance
- لا تضع فواصل زائدة في نهاية الكائنات أو المصفوفات
````

### 5.3 Placeholders

| Placeholder | Replaced With |
|-------------|---------------|
| `{SCRIPT_TEXT}` | Full script text (up to 500K chars) |
| `{TITLE}` | Script title |
| `{GENRE}` | Genre |
| `{DURATION}` | Duration in minutes |
| `{EXPECTED_RATING}` | Expected rating (PG, PG-13, R15, R18) |

### 5.4 Output Format

The model returns **valid JSON only**, with:

- `overall_score`, `severity`, `predicted_rating`, `confidence`
- `story_quality` (4 scores + explanations)
- `compliance` (21 risk factors with levels and details)
- `issues` (array of issue objects)
- `summary`, `recommendations`, `admin_summary`

### 5.5 Generation Config

```javascript
{
  temperature: 0.3,
  topK: 32,
  topP: 1,
  maxOutputTokens: 8192
}
```

---

## 6. How the Script Analysis Works

### 6.1 End-to-End Flow

1. **User enters script** in `ScriptTextEditor` (paste, type, or import from Word).
2. **User clicks "تحليل النص"** (Analyze Script).
3. **`handleAnalyzeScript(scriptText, htmlContent)`** runs in `AddScript.tsx`.
4. **Text is truncated** to 500,000 characters if longer (with a notice).
5. **API check:** `isGeminiConfigured()` — if API key exists, use real AI; otherwise use mock.
6. **Real AI path:** `analyzeScriptEnhanced(scriptText, metadata)` calls Gemini API.
7. **Result is saved** via `createEnhancedScriptAnalysis()` to Supabase.
8. **User is redirected** to the assessment page to view results.

### 6.2 Prompt Assembly

```javascript
const prompt = ENHANCED_ANALYSIS_PROMPT
  .replace('{SCRIPT_TEXT}', scriptText)
  .replace('{TITLE}', metadata.title)
  .replace('{GENRE}', metadata.genre)
  .replace('{DURATION}', metadata.duration.toString())
  .replace('{EXPECTED_RATING}', metadata.expected_rating);
```

The full prompt (instructions + script + metadata) is sent as a single text payload to Gemini.

### 6.3 API Request

- **Method:** `POST`
- **URL:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={API_KEY}`
- **Body:**
  ```json
  {
    "contents": [{ "parts": [{ "text": "<full prompt>" }] }],
    "generationConfig": {
      "temperature": 0.3,
      "topK": 32,
      "topP": 1,
      "maxOutputTokens": 8192
    }
  }
  ```

### 6.4 Response Handling

1. **Extract text:** `result.candidates[0].content.parts[0].text`
2. **Clean JSON:** Remove markdown code fences (`\`\`\`json` and `\`\`\``).
3. **Parse JSON:** `JSON.parse(jsonText)`.
4. **Validate severity:** Must be `low`, `medium`, `high`, or `critical`; otherwise fallback to `medium`.
5. **Fallback parsing:** If first parse fails, apply fixes (trailing commas, unescaped quotes, etc.) and retry.
6. **Return:** `{ success: true, data: analysisData }` or `{ success: false, error: message }`.

### 6.5 Error Handling and Fallbacks

| Scenario | Behavior |
|----------|----------|
| No API key | Return error; caller falls back to mock |
| API returns non-OK status | Return error; caller falls back to mock |
| Empty or missing `candidates` | Return error; caller falls back to mock |
| Invalid JSON in response | Try fixes; if still fails, return error |
| Invalid `severity` value | Override to `medium` and continue |

### 6.6 Mock Analysis Fallback

When Gemini is not used, `generateMockEnhancedAnalysis(metadata)` produces:

- Random scores (e.g. 75–95 for overall, 70–90 for story quality).
- All compliance factors set to `none` (with optional minor issues for lower scores).
- Arabic summaries and recommendations.
- No real script content analysis — based only on metadata.

### 6.7 Database Persistence

`createEnhancedScriptAnalysis(scriptId, analysisResult)`:

1. **Insert** into `script_analyses` (overall score, severity, story quality scores, summary, admin_summary).
2. **Insert** into `compliance_analysis` (21 compliance factors).
3. **Insert** into `script_issues` (each issue as a row).
4. **Update** `scripts.overall_score` for the script.

### 6.8 Display

`ScriptAssessmentEnhanced.tsx` loads data via `getEnhancedScriptAnalysis(scriptId)`, which joins:

- `script_analyses`
- `compliance_analysis`
- `script_issues`

The UI shows story quality scores, compliance factors by category, issues with suggestions, and the admin summary.

---

## 7. Articles and Regulations the Analysis Depends On

### 7.1 Explicit References in the Code

- **هيئة الأفلام السعودية (Saudi Film Commission)** — referenced in the prompt as the authority whose standards the analysis follows.
- No specific law or regulation IDs are cited in the code.

### 7.2 Implicit Regulatory Basis

The 21 compliance factors in the prompt are aligned with common Saudi regulatory themes:

- Public decency and social/religious norms  
- Criminal and prohibited activities  
- Public order and safety  
- Representation of authority and law  
- Moral message and conclusion  

These align with:

- General Commission for Audiovisual Media (GCAM) requirements  
- Saudi Film Commission / Ministry of Culture (film.moc.gov.sa) regulations  
- Daw' program script requirements (film.sa/daw)

### 7.3 No Direct Article References

- No URLs, law numbers, or official document IDs are embedded in the code.
- The prompt encodes **interpreted criteria** (triggers, risk levels, categories) rather than quoting specific articles.
- The system does not load or cite external documents at runtime.

### 7.4 Risk Levels and Triggers

Each compliance factor has:

- **Trigger (المحفز):** what in the script activates the factor  
- **Risk level:** none / low / medium / high  
- **Automatic rejection:** some factors (e.g. substance abuse, smuggling, violence/extremism) are marked as “رفض تلقائي” (automatic rejection) when present.

---

## 8. Text Extraction

### 8.1 Current Flow

- **ScriptTextEditor** uses:
  - Paste/typing
  - Import from Word via **mammoth** (`.docx`, `.doc`, `.txt`)
- Text is taken from the TipTap editor (`getText()`, `getHTML()`).
- **`textExtractor.ts`** is not used in the current Add Script flow.

### 8.2 Prepared but Unused

`src/utils/files/textExtractor.ts`:

- `extractTextFromFile(file)` — supports PDF and DOCX
- PDF: `pdfjs-dist`
- DOCX: `mammoth`
- Validation and length limits (e.g. 100–100,000 chars)

This is intended for future use when analysis is driven by uploaded files instead of editor content.

---

## 9. Database Schema

### 9.1 Tables

| Table | Purpose |
|------|---------|
| `script_analyses` | Overall score, severity, predicted_rating, confidence, story quality scores, summary, admin_summary |
| `compliance_analysis` | 21 compliance factors (risk + details) per analysis |
| `script_issues` | Individual issues (title, risk_level, category, excerpt, page/line, suggestion) |

### 9.2 Migration

`src/supabase/migrations/009_enhanced_ai_analysis.sql` defines the schema.

---

## 10. Dependencies

| Package | Purpose |
|---------|---------|
| `mammoth` | DOCX import in ScriptTextEditor |
| `pdfjs-dist` | PDF extraction in textExtractor (unused in main flow) |
| `pdf-parse` | Listed in package.json (not used in current analysis flow) |

---

## 11. Summary Table

| Aspect | Details |
|--------|---------|
| **AI model** | Google Gemini 2.5 Pro |
| **API** | `generativelanguage.googleapis.com/v1beta` |
| **Prompt** | Arabic, ~190 lines, 5 sections |
| **Output** | JSON (story quality, compliance, issues, summary) |
| **Fallback** | Mock analysis when API unavailable |
| **Regulatory basis** | Saudi Film Commission standards (no specific articles cited) |
| **Text source** | Editor (paste/type) + Word import via mammoth |
| **Max input** | 500,000 characters |
| **Storage** | Supabase (script_analyses, compliance_analysis, script_issues) |

---

## 12. Recommendations

1. **Regulatory alignment:** Add references to official GCAM/Film Commission documents (URLs or IDs) in the prompt or docs.
2. **Text extraction:** Integrate `extractTextFromFile` for PDF/DOCX uploads if moving to file-based analysis.
3. **Prompt versioning:** Version the prompt and store it (e.g. in DB or config) for traceability.
4. **Error handling:** Improve handling of malformed JSON and API errors (retries, clearer user messages).

---

*Report generated from codebase analysis. Last updated: March 11, 2025.*
