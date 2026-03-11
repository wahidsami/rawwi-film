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

`src/utils/ai/gemini-enhanced.ts` — constant `ENHANCED_ANALYSIS_PROMPT` (lines 121–310).

### 5.2 Prompt Structure

The prompt is in Arabic and has five main sections:

1. **Story quality evaluation (4 metrics)**  not needed we can drop this
   - Plot strength and tension  
   - Character development  
   - Climax and resolution  
   - Main theme  

   Each metric: score 0–100 + explanation.

2. **Compliance with Saudi laws and norms (21 factors in 5 categories)**  
   - **a. Public decency and social/religious principles (5)**  
     - Unsupervised mixing, PDA, improper attire, language/dialogue, anti-family values  
   - **b. Criminal and prohibited activities (5)**  
     - Substance abuse, smuggling, defamation, cybercrime, violence/extremism  
   - **c. Public order and safety (4)**  
     - Unauthorized assembly, traffic violations, property damage, disrespect of law enforcement  
   - **d. Authority and system representation (4)**  
     - Law enforcement depiction, evasion of law, paternal authority, conflict resolution  
   - **e. Moral message and conclusion (3)**  
     - Consequences of crime, glamorization, hope/responsibility  

3. **Issues**  
   For each problem: title, risk_level, category, excerpt, page_number, line_start, line_end, suggestion.

4. **Script metadata**  
   Title, genre, duration, expected rating.

5. **Admin story summary**  
   200–300 words: main theme, main characters, plot, message, target audience, overall quality.

### 5.3 Placeholders

- `{SCRIPT_TEXT}` — full script text  
- `{TITLE}` — script title  
- `{GENRE}` — genre  
- `{DURATION}` — duration in minutes  
- `{EXPECTED_RATING}` — expected rating (PG, PG-13, R15, R18)

### 5.4 Output Format

The model is instructed to return **valid JSON only**, with:

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

## 6. Articles and Regulations the Analysis Depends On

### 6.1 Explicit References in the Code

- **هيئة الأفلام السعودية (Saudi Film Commission)** — referenced in the prompt as the authority whose standards the analysis follows.
- No specific law or regulation IDs are cited in the code.

### 6.2 Implicit Regulatory Basis

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

### 6.3 No Direct Article References

- No URLs, law numbers, or official document IDs are embedded in the code.
- The prompt encodes **interpreted criteria** (triggers, risk levels, categories) rather than quoting specific articles.
- The system does not load or cite external documents at runtime.

### 6.4 Risk Levels and Triggers

Each compliance factor has:

- **Trigger (المحفز):** what in the script activates the factor  
- **Risk level:** none / low / medium / high  
- **Automatic rejection:** some factors (e.g. substance abuse, smuggling, violence/extremism) are marked as “رفض تلقائي” (automatic rejection) when present.

---

## 7. Text Extraction

### 7.1 Current Flow

- **ScriptTextEditor** uses:
  - Paste/typing
  - Import from Word via **mammoth** (`.docx`, `.doc`, `.txt`)
- Text is taken from the TipTap editor (`getText()`, `getHTML()`).
- **`textExtractor.ts`** is not used in the current Add Script flow.

### 7.2 Prepared but Unused

`src/utils/files/textExtractor.ts`:

- `extractTextFromFile(file)` — supports PDF and DOCX
- PDF: `pdfjs-dist`
- DOCX: `mammoth`
- Validation and length limits (e.g. 100–100,000 chars)

This is intended for future use when analysis is driven by uploaded files instead of editor content.

---

## 8. Database Schema

### 8.1 Tables

| Table | Purpose |
|------|---------|
| `script_analyses` | Overall score, severity, predicted_rating, confidence, story quality scores, summary, admin_summary |
| `compliance_analysis` | 21 compliance factors (risk + details) per analysis |
| `script_issues` | Individual issues (title, risk_level, category, excerpt, page/line, suggestion) |

### 8.2 Migration

`src/supabase/migrations/009_enhanced_ai_analysis.sql` defines the schema.

---

## 9. Dependencies

| Package | Purpose |
|---------|---------|
| `mammoth` | DOCX import in ScriptTextEditor |
| `pdfjs-dist` | PDF extraction in textExtractor (unused in main flow) |
| `pdf-parse` | Listed in package.json (not used in current analysis flow) |

---

## 10. Summary Table

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

## 11. Recommendations

1. **Regulatory alignment:** Add references to official GCAM/Film Commission documents (URLs or IDs) in the prompt or docs.
2. **Text extraction:** Integrate `extractTextFromFile` for PDF/DOCX uploads if moving to file-based analysis.
3. **Prompt versioning:** Version the prompt and store it (e.g. in DB or config) for traceability.
4. **Error handling:** Improve handling of malformed JSON and API errors (retries, clearer user messages).

---

*Report generated from codebase analysis. Last updated: March 11, 2025.*
