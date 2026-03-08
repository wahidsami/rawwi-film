# Lexicon-Enhanced AI Analysis

## Problem
The AI analysis was failing to detect prohibited words like "نصاب" and other terms stored in the glossary (`slang_lexicon` table). The AI prompts were generic and didn't reference the specific prohibited terms that admins had configured.

## Solution
Enhanced the AI analysis pipeline to dynamically inject glossary terms into the Router and Judge prompts, ensuring OpenAI explicitly looks for these prohibited words.

---

## Changes Made

### 1. **Updated AI Prompts** (`supabase/functions/_shared/aiConstants.ts` & `apps/worker/src/aiConstants.ts`)

#### Router Prompt (v1.0 → v1.1)
Added lexicon injection placeholder:
```arabic
قاعدة المعجم المحظور: إذا احتوى النص على أي من الألفاظ المحظورة التالية أو مشتقاتها، يجب إضافة المواد المرتبطة بها إلى المرشحين:
{LEXICON_TERMS}
```

#### Judge Prompt (v1.1 → v1.2)
Added mandatory lexicon checking phase:
```arabic
المرحلة 1 — فحص معجمي صارم (إلزامي):
قائمة الألفاظ المحظورة التالية يجب فحصها بدقة في النص. إذا وُجد أي منها أو مشتقاته، أخرج مخالفة فوراً:
{LEXICON_TERMS}

قاعدة المطابقة: ابحث عن الكلمة الكاملة والمشتقات (مثلاً: "نصاب" تشمل "نصابة"، "نصابين"، "نصب"). لا تتجاهل أي لفظ محظور حتى لو كان في سياق حوار.
إن وُجد لفظ محظور، استخدم المادة والشدة المحددة في القائمة أعلاه.
```

### 2. **Added Helper Functions**

```typescript
/**
 * Build lexicon terms string for injection into prompts.
 * Format: "- لفظ: نصاب | المادة: 5 | الشدة: high"
 */
export function buildLexiconTermsString(terms: Array<{
  term: string;
  gcam_article_id: number;
  severity_floor: string;
  gcam_article_title_ar?: string;
}>): string

/**
 * Inject lexicon terms into Router and Judge prompts.
 * Call this before sending prompts to OpenAI.
 */
export function injectLexiconIntoPrompts(
  routerPrompt: string,
  judgePrompt: string,
  lexiconTerms: Array<...>
): { router: string; judge: string }
```

### 3. **Modified Worker Pipeline** (`apps/worker/src/pipeline.ts`)

At the start of `processChunkJudge`:
1. **Fetch active lexicon terms** from `slang_lexicon` table
2. **Inject terms** into Router and Judge prompts using `injectLexiconIntoPrompts()`
3. **Pass injected prompts** to `callRouter()` and `callJudgeRaw()`

```typescript
// 0) Fetch lexicon terms for prompt injection
const { data: lexiconTerms } = await supabase
  .from("slang_lexicon")
  .select("term, gcam_article_id, severity_floor, gcam_article_title_ar")
  .eq("is_active", true);

const terms = lexiconTerms || [];
const { router: routerPrompt, judge: judgePrompt } = injectLexiconIntoPrompts(
  ROUTER_SYSTEM_MSG,
  JUDGE_SYSTEM_MSG,
  terms
);
```

### 4. **Updated OpenAI Calls** (`apps/worker/src/openai.ts`)

Modified `callRouter()` and `callJudgeRaw()` to accept optional custom prompts:
```typescript
export async function callRouter(
  chunkText: string,
  articleList: GCAMArticle[],
  jobConfig: {...},
  routerSystemPrompt?: string  // NEW
): Promise<RouterOutput>

export async function callJudgeRaw(
  chunkText: string,
  selectedArticles: GCAMArticle[],
  globalStart: number,
  globalEnd: number,
  jobConfig: {...},
  judgeSystemPrompt?: string  // NEW
): Promise<string>
```

---

## How It Works

### Before (Generic Prompt)
```arabic
المرحلة 1 — فحص معجمي صارم: وجود سبّ، شتم، إهانة...
```
❌ AI uses general knowledge, may miss specific terms like "نصاب"

### After (Lexicon-Injected Prompt)
```arabic
المرحلة 1 — فحص معجمي صارم (إلزامي):
قائمة الألفاظ المحظورة التالية يجب فحصها بدقة في النص:
- لفظ: "نصاب" | المادة: 5 (الكرامة الإنسانية) | الشدة: high
- لفظ: "حرامي" | المادة: 5 | الشدة: high
- لفظ: "كذاب" | المادة: 5 | الشدة: medium
...
```
✅ AI explicitly checks for each term and its derivatives

---

## Example Lexicon Entry

When you add a term to the glossary:
```sql
INSERT INTO slang_lexicon (
  term, normalized_term, term_type, category, 
  severity_floor, enforcement_mode, 
  gcam_article_id, gcam_atom_id, gcam_article_title_ar
) VALUES (
  'نصاب', 'نصاب', 'word', 'insult',
  'high', 'mandatory_finding',
  5, '5-1', 'الكرامة الإنسانية'
);
```

The AI will receive:
```
- لفظ: "نصاب" | المادة: 5 (الكرامة الإنسانية) | الشدة: high
```

And will:
1. **Search** for "نصاب" and derivatives ("نصابة", "نصابين", etc.)
2. **Flag** as violation immediately if found
3. **Use** Article 5 and severity "high" as specified

---

## Deployment Steps

### 1. Deploy Edge Functions
```bash
cd "D:\Waheed\MypProjects\Raawifilm fix"
npx supabase functions deploy scripts
npx supabase functions deploy reports  # Already done
```

### 2. Rebuild & Deploy Worker
```bash
cd apps/worker
pnpm build
# Deploy to your worker environment (Railway, Heroku, etc.)
```

### 3. Add Lexicon Terms
Use the Glossary UI in the app to add prohibited terms, or run SQL:
```sql
INSERT INTO slang_lexicon (
  term, normalized_term, term_type, category,
  severity_floor, enforcement_mode,
  gcam_article_id, gcam_atom_id, gcam_article_title_ar,
  is_active
) VALUES
  ('نصاب', 'نصاب', 'word', 'insult', 'high', 'mandatory_finding', 5, '5-1', 'الكرامة الإنسانية', true),
  ('حرامي', 'حرامي', 'word', 'insult', 'high', 'mandatory_finding', 5, '5-1', 'الكرامة الإنسانية', true),
  ('كذاب', 'كذاب', 'word', 'insult', 'medium', 'mandatory_finding', 5, '5-1', 'الكرامة الإنسانية', true);
```

### 4. Test
1. Upload a script containing "نصاب"
2. Run analysis
3. Verify the AI detects it and creates a finding

---

## Benefits

1. **Precision**: AI explicitly checks for configured terms
2. **Flexibility**: Add/remove terms via Glossary UI without changing code
3. **Consistency**: Same terms checked across all scripts
4. **Derivatives**: AI checks word variations (نصاب → نصابة, نصابين)
5. **Strict Detection**: AI flags violations based on literal rule matching, regardless of story context

---

## Monitoring

Check worker logs for:
```
Lexicon terms injected into prompts: { termsCount: 15, sampleTerms: ["نصاب", "حرامي", "كذاب"] }
```

If `termsCount: 0`, add terms to the glossary.

---

## Related Files

- `supabase/functions/_shared/aiConstants.ts` - Edge Function prompts
- `apps/worker/src/aiConstants.ts` - Worker prompts (duplicate)
- `apps/worker/src/pipeline.ts` - Prompt injection logic
- `apps/worker/src/openai.ts` - OpenAI API calls
- `supabase/migrations/0001_init.sql` - `slang_lexicon` table schema
- `supabase/functions/lexicon/index.ts` - Glossary API

---

## Version History

- **v1.0 (Router)**: Generic prompt
- **v1.1 (Router)**: Added lexicon injection placeholder
- **v1.1 (Judge)**: Precision-first prompt (false positive reduction)
- **v1.2 (Judge)**: Added mandatory lexicon checking phase with injection
- **v1.3 (Judge - STRICT MODE)**: Removed interpretive/soft signals, enforced literal rule matching without story context consideration. AI now operates as a strict rule matcher that flags all violations regardless of dramatic context.

---

## Notes

- Lexicon terms are fetched **per chunk** (not cached globally) to ensure fresh data
- Terms with `is_active = false` are excluded
- Empty lexicon = fallback message in prompt: "لا توجد ألفاظ محظورة محددة حالياً"
- Prompt injection happens **before** idempotency check (so cached runs use old prompts; clear cache after adding terms)
