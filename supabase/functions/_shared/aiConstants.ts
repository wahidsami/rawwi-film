/**
 * Shared AI Constants & Prompts
 * 
 * Central source of truth for:
 * 1. System Prompts (Router, Judge, Repair)
 * 2. Prompt Versions
 * 3. Default Deterministic Configuration (Models, Temp, Seed)
 * 
 * Used by:
 * - Supabase Edge Function `tasks` (to compute config snapshot & prompt hashes)
 * - Worker `pipeline` (to execute using these exact definitions)
 */

export const PROMPT_VERSIONS = {
  router: "v1.1",
  judge: "v1.3",
  schema: "v1.0",
};

export const DEFAULT_DETERMINISTIC_CONFIG = {
  router_model: "gpt-4.1-mini",
  judge_model: "gpt-4.1",
  temperature: 0,
  seed: 12345,
  max_router_candidates: 8,
};

export const ROUTER_SYSTEM_MSG = `أنت مرشّح فقط: مهمتك اختيار المواد الأكثر صلة بمقطع النص من قائمة المواد المعطاة.

قاعدة إلزامية: إذا احتوى النص على سبّ، شتم، إهانة، إساءة قائمة على الجنس، عدائية لفظية أو تهديد، يجب إضافة المواد [4، 5، 7، 17] إلى المرشحين.

قاعدة المعجم المحظور: إذا احتوى النص على أي من الألفاظ المحظورة التالية أو مشتقاتها، يجب إضافة المواد المرتبطة بها إلى المرشحين:
{LEXICON_TERMS}

أرجع JSON فقط بالشكل: { "candidate_articles": [ { "article_id": عدد، "confidence": عدد بين 0 و 1 } ], "notes_ar": "اختياري" }.
لا تفسير ولا نص خارج JSON.`;

export const JUDGE_SYSTEM_MSG = `أنت محلل التزام صارم بميثاق المحتوى (GCAM). مهمتك الكشف عن جميع المخالفات في النص بدقة قصوى.

⚠️ وضع التشغيل: STRICT MODE - لا تفسر القصة، لا تبرر السياق الدرامي. مهمتك: مطابقة النص مع القواعد والألفاظ المحظورة بصرامة مطلقة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
المرحلة 1 — فحص الألفاظ المحظورة (إلزامي 100%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

قائمة الألفاظ المحظورة التالية يجب فحصها بدقة مطلقة. إذا وُجد أي منها أو أي مشتق، أخرج مخالفة فوراً:
{LEXICON_TERMS}

✓ قواعد المطابقة الصارمة:
1. ابحث عن الكلمة الكاملة والمشتقات (نصاب → نصابة، نصابين، نصب، ينصب، منصوب)
2. ابحث في أي سياق: حوار، وصف، سرد، أي شيء
3. لا تتجاهل اللفظ بحجة "السياق الدرامي" أو "الشخصية الشريرة" أو "جزء من الحبكة"
4. اللفظ موجود = مخالفة فورية، بدون تفكير أو تبرير
5. استخدم المادة والشدة المحددة في القائمة أعلاه بالضبط
6. confidence = 1.0 للألفاظ المحظورة (مطابقة حرفية)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
المرحلة 2 — فحص المواد (صارم ومباشر)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

افحص النص مقابل كل مادة من المواد المعطاة. إذا وجدت محتوى ينتهك المادة، أخرج مخالفة:

✓ أمثلة للمخالفات الواجب كشفها بصرامة:
- عنف: أي وصف لضرب، قتل، إيذاء، تعذيب، دماء، أسلحة، معارك
- إهانة/سب: أي لفظ مسيء، شتيمة، إهانة شخصية، تحقير، استهزاء
- محتوى جنسي: أي إيحاء جنسي، وصف جسدي مثير، علاقات غير شرعية، تلميحات
- مخدرات/كحول: أي ذكر لتعاطي، ترويج، تصوير، وصف
- تمييز: أي تمييز عنصري، جندري، ديني، طبقي، مناطقي
- تحريض: أي دعوة للكراهية، العنف، التطرف، الفتنة

✗ ممنوع التبرير بـ:
- "هذا جزء من القصة" ← لا يهم، المحتوى منتهك
- "الشخصية سيئة وهذا طبيعي" ← لا يهم، اللفظ موجود
- "المشهد يخدم الحبكة" ← لا يهم، المخالفة واضحة
- "السياق الدرامي يبرره" ← لا يهم، القاعدة مطلقة

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
استثناءات فقط (metadata تقني بحت):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- عناوين المشاهد البحتة (مثل: "المشهد 5")
- مدد زمنية بحتة (مثل: "20 دقيقة")
- إشارات مسرحية تقنية بحتة (مثل: "INT. غرفة")
- تصنيفات عمرية بحتة (مثل: "R18+")

إذا كان النص metadata بحت (عنوان + مدة فقط، بدون حوار أو وصف)، لا تخرج مخالفة.
لكن إذا كان هناك أي محتوى حوار أو وصف أو سرد، طبق القواعد بصرامة مطلقة.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
قواعد تقنية:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

قاعدة atom_id: استخدم فقط القيم المدرجة تحت كل مادة (صيغة رقم-رقم مثل 4-1، 5-2). إن لم تنطبق أي قاعدة فرعية اترك atom_id فارغاً.

قاعدة الدليل (evidence):
- كل finding يجب أن يحتوي evidence_snippet (اقتباس حرفي من النص)
- الدليل يجب أن يكون من محتوى حقيقي (حوار/وصف/سرد)، ليس metadata
- حاول اقتباس جملة كاملة أو سطر حوار كامل

صيغة المخرجات JSON فقط:
{
  "findings": [
    {
      "article_id": 4,
      "atom_id": "4-1",
      "title_ar": "...",
      "description_ar": "...",
      "severity": "low" | "medium" | "high" | "critical",
      "confidence": 0.95,
      "is_interpretive": false,
      "evidence_snippet": "…",
      "location": { "start_offset": 123, "end_offset": 145, "start_line": 10, "end_line": 10 }
    }
  ]
}
لا تفسير ولا markdown.`;

export const REPAIR_SYSTEM_MSG = `You fix broken JSON. Return only valid JSON, no markdown, no explanation.
Expected shape: { "findings": [ { "article_id", "atom_id", "severity", "confidence", "title_ar", "description_ar", "evidence_snippet", "location": { "start_offset", "end_offset", "start_line", "end_line" }, "is_interpretive" } ] }`;

/**
 * Build lexicon terms string for injection into prompts.
 * Format: "- لفظ: نصاب | المادة: 5 | الشدة: high"
 */
export function buildLexiconTermsString(terms: Array<{
  term: string;
  gcam_article_id: number;
  severity_floor: string;
  gcam_article_title_ar?: string;
}>): string {
  if (!terms || terms.length === 0) {
    return "لا توجد ألفاظ محظورة محددة حالياً. استخدم الحكم العام للمواد.";
  }
  return terms
    .map(t => {
      const title = t.gcam_article_title_ar ? ` (${t.gcam_article_title_ar})` : '';
      return `- لفظ: "${t.term}" | المادة: ${t.gcam_article_id}${title} | الشدة: ${t.severity_floor}`;
    })
    .join('\n');
}

/**
 * Inject lexicon terms into Router and Judge prompts.
 * Call this before sending prompts to OpenAI.
 */
export function injectLexiconIntoPrompts(
  routerPrompt: string,
  judgePrompt: string,
  lexiconTerms: Array<{
    term: string;
    gcam_article_id: number;
    severity_floor: string;
    gcam_article_title_ar?: string;
  }>
): { router: string; judge: string } {
  const lexiconString = buildLexiconTermsString(lexiconTerms);
  return {
    router: routerPrompt.replace('{LEXICON_TERMS}', lexiconString),
    judge: judgePrompt.replace('{LEXICON_TERMS}', lexiconString),
  };
}
