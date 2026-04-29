/**
 * Multi-Pass Detection System
 * 
 * Uses 11 specialized scanners instead of 1 complex prompt:
 * - Pass 0: Glossary (Lexicon terms from database)
 * - Pass 1: Insults & Profanity
 * - Pass 2: Violence & Threats
 * - Pass 3: Sexual Content
 * - Pass 4: Drugs & Alcohol
 * - Pass 5: Discrimination & Incitement
 * - Pass 6: Women & Dignity
 * 
 * Each pass runs in parallel with a focused, simple prompt.
 */

import type { GCAMArticle } from "./gcam.js";
import type { JudgeFinding } from "./schemas.js";
import { callJudgeRaw, parseJudgeWithRepair } from "./openai.js";
import { logger } from "./logger.js";
import { getFrameworkPromptSection } from "./canonicalAtomFramework.js";
import { flushChunkPassProgress, reportChunkPassProgressDebounced } from "./jobs.js";
import { evaluatePassGating } from "./passGating.js";
import { getGcamRefsForCanonicalAtom } from "./canonicalAtomMapping.js";
import { config } from "./config.js";

export interface LexiconTerm {
  term: string;
  gcam_article_id: number;
  severity_floor: string;
  gcam_article_title_ar?: string | null;
  term_variants?: string[] | null;
}

export interface PassDefinition {
  name: string;
  articleIds: number[];
  buildPrompt: (articles: GCAMArticle[], lexiconTerms?: LexiconTerm[]) => string;
  model?: string; // Optional: override model for this pass
}

export interface PlannedPassSkip {
  passName: string;
  reason: string;
  matchedSignals?: string[];
  model?: string;
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined): number {
  const left = a ?? Number.POSITIVE_INFINITY;
  const right = b ?? Number.POSITIVE_INFINITY;
  return left - right;
}

function compareNullableText(a: string | null | undefined, b: string | null | undefined): number {
  return (a ?? "").localeCompare(b ?? "", "ar");
}

function compareJudgeFindingsStable(a: JudgeFinding, b: JudgeFinding): number {
  return (
    compareNullableNumber(a.article_id, b.article_id) ||
    compareNullableText(a.atom_id, b.atom_id) ||
    compareNullableText(a.canonical_atom, b.canonical_atom) ||
    compareNullableNumber(a.location?.start_offset, b.location?.start_offset) ||
    compareNullableNumber(a.location?.end_offset, b.location?.end_offset) ||
    compareNullableText(a.evidence_snippet, b.evidence_snippet) ||
    compareNullableText(a.title_ar, b.title_ar) ||
    compareNullableText(a.description_ar, b.description_ar) ||
    compareNullableText(a.detection_pass, b.detection_pass) ||
    compareNullableText(a.rationale_ar, b.rationale_ar)
  );
}

function compareJudgeFindingPreference(a: JudgeFinding, b: JudgeFinding): number {
  if (a.confidence !== b.confidence) return b.confidence - a.confidence;
  if ((a.is_interpretive ? 1 : 0) !== (b.is_interpretive ? 1 : 0)) {
    return (a.is_interpretive ? 1 : 0) - (b.is_interpretive ? 1 : 0);
  }
  const rationaleLenDiff = (b.rationale_ar?.trim().length ?? 0) - (a.rationale_ar?.trim().length ?? 0);
  if (rationaleLenDiff !== 0) return rationaleLenDiff;
  return compareJudgeFindingsStable(a, b);
}

function sortJudgeFindingsStable(findings: JudgeFinding[]): JudgeFinding[] {
  return [...findings].sort(compareJudgeFindingsStable);
}

function normalizeFindingForPass(
  finding: JudgeFinding,
  articles: GCAMArticle[]
): JudgeFinding {
  const allowedArticleIds = new Set(articles.map((article) => article.id));
  const fallbackArticleId = articles[0]?.id ?? 5;
  const canonicalAtom = finding.canonical_atom ?? null;
  let articleId = typeof finding.article_id === "number" ? finding.article_id : 0;
  let atomId = finding.atom_id ?? null;

  if (canonicalAtom) {
    const allowedRefs = getGcamRefsForCanonicalAtom(canonicalAtom).filter((ref) => allowedArticleIds.has(ref.article_id));
    if (allowedRefs.length > 0) {
      const currentAllowed = allowedRefs.some((ref) => ref.article_id === articleId);
      const preferred = allowedRefs[0];
      if (!currentAllowed) {
        articleId = preferred.article_id;
        atomId = preferred.atom_id ?? atomId;
      } else if (atomId != null && !atomId.startsWith(`${articleId}-`)) {
        atomId = preferred.atom_id ?? null;
      }
    }
  }

  if (!allowedArticleIds.has(articleId)) {
    articleId = fallbackArticleId;
    if (atomId != null && !atomId.startsWith(`${articleId}-`)) atomId = null;
  }

  return {
    ...finding,
    article_id: articleId,
    atom_id: atomId,
  };
}

/**
 * Build article payload for a specific set of articles
 */
function buildArticlePayload(articles: GCAMArticle[]): string {
  return articles
    .map((a) => {
      let block = `المادة ${a.id}: ${a.title_ar}\n${a.text_ar ?? ""}`;
      if (a.atoms?.length) {
        block += "\n" + a.atoms.map((at) => `  ${at.atom_id}: ${at.text_ar}`).join("\n");
      }
      return block;
    })
    .join("\n\n");
}

const STRUCTURED_RATIONALE_INSTRUCTIONS = `قواعد الشرح الإلزامية لكل finding:
1. rationale_ar مطلوبة دائماً ولا تتركها فارغة.
2. اشرح باختصار: أين يظهر المقتطف في النص، ما اللفظ أو السلوك الذي تم رصده، ولماذا يندرج تحت عنوان المخالفة نفسه.
3. اذكر سبباً قانونياً أو دلالياً واضحاً، لا مجرد إعادة صياغة النص.
4. ممنوع التعليل العام مثل: "يحتوي النص على مخالفة" أو "وجود لفظ مخالف" دون شرح.
5. إذا كان المقتطف حواراً أو وصفاً أو تهديداً أو إهانة مباشرة فاذكر ذلك صراحة.
6. في evidence_snippet أرجع أصغر اقتباس حرفي ممكن يثبت المخالفة، وليس فقرة كاملة إلا إذا كانت الضرورة تقتضي ذلك.
7. location.start_offset و location.end_offset يجب أن يحددا نفس المقتطف القصير داخل chunk الحالي، لا نافذة واسعة حوله.
8. ممنوع ذكر أرقام المواد أو أكواد atoms في rationale_ar؛ اكتفِ بعنوان المخالفة ومعنى المخالفة نفسه.
9. لا تذكر أسماء الشخصيات أو تفترض هوية المتحدث/المستهدف إلا إذا ظهرت حرفياً في المقتطف نفسه.`;

const V3_SHARED_PROMPT_OVERLAY = `=== Violations System v3 ===
هذه النسخة مبنية على دليل المخالفات المحدّث، وتُستخدم كطبقة تشغيلية محافظة فوق النظام الحالي.

قواعد ثابتة في v3:
1. title_ar يجب أن يكون عنوان المخالفة فقط، مثل: "المساس بالثوابت الدينية" أو "التنمر الجارح والسخرية".
2. ممنوع تضمين أرقام المواد أو أكواد atoms داخل title_ar.
3. الاحتفاظ article_id / atom_id يكون فقط لربط النظام الخلفي، وليس كعنوان ظاهر.
4. إذا كان في النص سبب أوضح ضمن مسار متخصص آخر، فلا تُسقطه هنا.
5. evidence_snippet يجب أن يكون أقصر اقتباس حرفي يثبت المخالفة.
6. لا تعتمد على الشرح العام أو تلخيص الحبكة لإنتاج مخالفة.
7. إذا كانت الحالة تحتاج تفسيراً واسعاً أو كانت مترددة، فالأفضل الإرجاع فارغاً.
8. التزم بالعنوان الإنساني للمخالفة فقط عند صياغة title_ar، ولا تذكر المادة أو atom في النص الظاهر.
9. لا تفترض هوية المتحدث أو المستهدف إذا لم تكن مذكورة حرفياً في النص؛ استخدم فقط ما يثبته المقتطف نفسه.
10. في rationale_ar، اشرح لماذا العبارة مخالفة من السياق المباشر أو من معنى الاقتباس فقط، من دون سرد أسماء الشخصيات أو إعادة كتابة الحبكة.

هذه الطبقة لا تلغي النظام الحالي؛ يمكن الرجوع إلى v2 مباشرة عبر المتغير VIOLATION_SYSTEM_VERSION=v2.`;

function applyViolationSystemOverlay(prompt: string, passName: string): string {
  if (config.VIOLATION_SYSTEM_VERSION !== "v3") return prompt;
  const passLabel =
    passName === "glossary"
      ? "Pass: glossary"
      : passName === "insults"
        ? "Pass: insults"
        : passName === "violence"
          ? "Pass: violence"
          : passName === "sexual_content"
            ? "Pass: sexual_content"
            : passName === "drugs_alcohol"
              ? "Pass: drugs_alcohol"
              : passName === "discrimination_incitement"
                ? "Pass: discrimination_incitement"
                : passName === "women"
                  ? "Pass: women"
                  : passName === "national_security"
                    ? "Pass: national_security"
                    : passName === "extremism_banned_groups"
                      ? "Pass: extremism_banned_groups"
                      : passName === "misinformation"
                        ? "Pass: misinformation"
                        : passName === "international_relations"
                          ? "Pass: international_relations"
                          : `Pass: ${passName}`;

  return `${V3_SHARED_PROMPT_OVERLAY}

${passLabel}

${prompt}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 0: GLOSSARY (Lexicon Terms)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildGlossaryPrompt(articles: GCAMArticle[], lexiconTerms: LexiconTerm[] = []): string {
  const variantsList = (t: LexiconTerm) => [t.term, ...(t.term_variants ?? [])].filter(Boolean);
  const lexiconList = lexiconTerms.map(t => variantsList(t).map(v => `"${v}"`).join('، ')).join(' ؛ ');
  const lexiconDetails = lexiconTerms
    .map(t => {
      const vs = (t.term_variants ?? []).filter(Boolean);
      const extra = vs.length > 0 ? ` (أشكال: ${vs.join('، ')})` : '';
      return `- "${t.term}"${extra} → المادة ${t.gcam_article_id} | الشدة: ${t.severity_floor}`;
    })
    .join('\n');
  
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("INSULT");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف ألفاظ محظورة من المعجم.

الألفاظ المحظورة:
${lexiconDetails}

المواد المرتبطة:
${articlePayload}

مهمتك:
1. ابحث في النص عن أي لفظ من القائمة: ${lexiconList}
2. ابحث أيضاً عن المشتقات (مثال: نصاب → نصابة، نصابين، نصب، ينصب)
3. إذا وجدت اللفظ، أخرج مخالفة فوراً

قاعدة: اللفظ موجود = مخالفة. لا استثناءات.

استثناء وحيد: عناوين المشاهد البحتة (مثل: "المشهد 5") والمدد الزمنية البحتة (مثل: "20 دقيقة").

مهم: أخرج مخالفة فقط إذا ظهر في النص حرفياً أحد الألفاظ/المشتقات أعلاه. لا تُخرج مخالفة لمواضيع أخرى (عنف، مشاهد طويلة) تحت عنوان المعجم.
في title_ar اكتب دائماً: "مطابقة من قاموس المصطلحات: [اللفظ كما ورد]" — لا تنسخ عنواناً عاماً دون ذكر اللفظ.

أرجع JSON (لا تُرجع severity — تُحسب في الخلفية؛ استخدم canonical_atom والعوامل الأربعة 1–4):
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-2",
      "canonical_atom": "INSULT",
      "intensity": 3,
      "context_impact": 2,
      "legal_sensitivity": 2,
      "audience_risk": 1,
      "title_ar": "مطابقة من قاموس المصطلحات: نصاب",
      "description_ar": "وجود لفظ 'نصاب' في النص",
      "rationale_ar": "المقتطف يظهر في حوار مباشر ويتضمن اللفظ المحظور \"نصاب\" كما ورد حرفياً، لذلك يندرج تحت المادة 5 بوصفه إهانة أو اتهاماً مهيناً مباشراً.",
      "confidence": 1.0,
      "is_interpretive": false,
      "evidence_snippet": "أنت مجرد نصاب",
      "location": { "start_offset": 123, "end_offset": 145, "start_line": 10, "end_line": 10 }
    }
  ]
}`;
}

const MAX_DETECTION_NOTE = `⚠️ وضع الكشف الأقصى: مهمتك كشف كل مخالفة. لا تتساهل. أي لفظ أو وصف يلامس المادة = أخرج مخالفة.`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 1: INSULTS & PROFANITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildInsultsPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("INSULT");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في تقييم الإهانات اللفظية داخل النصوص الدرامية.

مهمتك هي الحكم الدقيق المبني على دليل واضح من النص، وليس البحث العشوائي.

=== تعريف الإهانة ===
الإهانة هي أي تعبير يحط من قدر شخص أو يهاجمه أو يقلل من كرامته بشكل مباشر.

تشمل:
- الإهانات المباشرة مثل "غبي" و"فاشل"
- التقليل من القيمة مثل "ما لك فايدة"
- التحقير أو الإذلال
- السخرية الجارحة
- التشبيه المهين مثل "أنت مثل الحمار"
- الإهانة غير المباشرة الواضحة مثل "واضح مستواك"

لا تشمل:
- التهديد أو العنف مثل "أضربك" وهذا يذهب لمسار العنف
- التمييز أو الأدوار الاجتماعية وهذا يذهب لمسارات أخرى
- العبارات غير الواضحة أو القابلة للتفسير

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع أي مخالفة إلا إذا وجدت عبارة نصية واضحة تحتوي على إهانة.

يجب أولًا:
1. تحديد العبارة المهينة حرفيًا من النص
2. التأكد أنها إهانة مباشرة أو واضحة
3. ثم تصنيفها

=== قواعد الدقة ===
- كن دقيقًا ومحافظًا
- إذا كان هناك شك فلا تُرجع مخالفة
- لا تعتمد على التخمين أو التفسير
- يجب أن تكون الإهانة واضحة في النص نفسه
- canonical_atom لهذا المسار يجب أن تكون "INSULT"
- إذا كان المقتطف تهديدًا أو عنفًا فقط بدون إهانة لفظية واضحة فلا تُخرجه من هذا المسار

=== أمثلة صحيحة ===
- "أنت غبي" → إهانة
- "يا فاشل" → إهانة
- "أنت مثل الحمار" → إهانة
- "ما لك فايدة في حياتي" → إهانة لأنها تحط من القيمة والكرامة مباشرة

=== أمثلة غير صحيحة لهذا المسار ===
- "أضربك" → تهديد وليس إهانة
- "إذا رفعتِ صوتك بقوم آخذ الجزمة وأضربك فيها" → عنف وليس إهانة
- "مكانك المطبخ" → تمييز أو امتهان دور اجتماعي وليس إهانة مباشرة
- "بقتلك" → تهديد وليس إهانة

=== المطلوب ===
حلل النص وحدد فقط الإهانات اللفظية المباشرة أو الواضحة.

إذا لم توجد إهانة لفظية واضحة:
{ "findings": [] }`;
}

function buildInsultsUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===
- يجب استخراج أصغر عبارة مهينة ممكنة
- يجب أن يكون evidence_snippet مطابقًا حرفيًا للنص
- يجب أن تتطابق offsets مع نفس النص تمامًا
- لا تُرجع أي نتيجة بدون دليل واضح
- إذا لم توجد إهانة لفظية واضحة فأرجع: { "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 2: VIOLENCE & THREATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildViolencePrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("VIOLENCE");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف العنف والتهديدات داخل النصوص الدرامية.

مهمتك هي تحديد حالات العنف بدقة عالية، بناءً على دليل نصي واضح وصريح فقط.

=== تعريف العنف ===
العنف هو أي فعل أو تهديد يتضمن إلحاق ضرر جسدي بشخص.

يشمل:
- التهديد المباشر مثل "أضربك" و"بقتلك"
- التهديد غير المباشر الواضح مثل "راح أوريك"
- العنف الفعلي مثل "ضربه" و"دفعه بقوة"
- استخدام أدوات للإيذاء مثل "بعصا" و"بالجزمة"
- عنف أسري أو مدرسي أو ضد طفل عندما يكون النص الجسدي واضحاً

لا يشمل:
- الإهانات اللفظية فقط مثل "غبي" أو "يا فاشل"
- التمييز أو الإهانة الاجتماعية دون تهديد جسدي
- المشاعر أو التوتر أو الغضب بدون تهديد أو أذى جسدي واضح

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع أي مخالفة إلا إذا وجدت عبارة نصية واضحة تحتوي على عنف أو تهديد جسدي.

⚠️ تحذير مهم جدًا:

لا تعتمد على فهم المشهد أو القصة أو السياق العام.

❌ ممنوع:
- استنتاج العنف من وصف المشهد
- ربط أحداث متعددة معًا
- استخدام الفهم العام لاختيار النص

✅ المسموح فقط:
- استخراج عبارة تحتوي على العنف بشكل صريح داخل النص نفسه

إذا لم تكن عبارة العنف موجودة حرفيًا:
→ لا تُرجع أي نتيجة

النظام لا يهتم بما "تعرفه"، بل بما "تراه حرفيًا في النص"

يجب أولًا:
1. تحديد العبارة حرفيًا من النص
2. التأكد أنها تحتوي على عنف أو تهديد جسدي
3. ثم تصنيفها

=== قواعد الدقة ===
- كن دقيقًا ومحافظًا
- لا تعتمد على التفسير العام للمشهد
- لا تستخدم معلومات من خارج النص المحدد
- إذا كان هناك شك فلا تُرجع مخالفة
- canonical_atom لهذا المسار يجب أن تكون "VIOLENCE"
- إذا كانت العبارة إهانة فقط أو تمييزاً فقط بدون تهديد جسدي واضح فلا تُخرجها من هذا المسار

=== قاعدة المطابقة النصية (صارمة جدًا) ===
- يجب أن يكون evidence_snippet نسخة حرفية 100% من النص
- يجب أن يكون النص منسوخًا كما هو دون أي تغيير
- ممنوع إعادة الصياغة أو التلخيص
- ممنوع اختيار نص تقريبي

⚠️ أي اختلاف ولو حرف واحد يعتبر خطأ

إذا لم تتمكن من إيجاد نص مطابق حرفيًا:
→ تجاهل الحالة بالكامل

❌ اختيار نص خاطئ أسوأ من عدم إرجاع نتيجة

=== أمثلة صحيحة ===
- "أضربك" → تهديد جسدي
- "والله بقتلك" → تهديد مباشر
- "دفعه بقوة" → عنف فعلي
- "آخذ الجزمة وأضربك فيها" → تهديد وعنف بأداة

=== أمثلة غير صحيحة لهذا المسار ===
- "أنت غبي" → إهانة وليس عنفًا
- "مكانك المطبخ" → تمييز أو تحقير وليس عنفًا
- "أنا زعلان" → ليس عنفًا
- "كلهم حرامية" → إهانة/اتهام وليس عنفًا

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة، تحقق من:

1. هل النص منسوخ حرفيًا من المقطع؟
2. هل يحتوي النص نفسه على تهديد أو عنف؟
3. هل يمكن فهم العنف من هذا النص وحده بدون تفسير؟

إذا كانت الإجابة "لا" لأي من هذه:
→ لا تُرجع النتيجة

=== المطلوب ===
حلل النص وحدد فقط العبارات التي تحتوي على عنف أو تهديد جسدي واضح.

إذا لم توجد مخالفة واضحة:
{ "findings": [] }`;
}

function buildViolenceUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===
- يجب استخراج أصغر عبارة تحتوي على العنف أو التهديد
- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص نفسه تمامًا
- لا تعتمد على الوصف العام للمشهد أو السطر المجاور
- لا تُرجع أي نتيجة بدون نص واضح

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود بنفس الشكل في المقطع
3. تأكد أن كل حرف مطابق

إذا لم توجد مخالفات واضحة:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 3: SEXUAL CONTENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSexualContentPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("SEXUAL");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف المحتوى الجنسي في النصوص الدرامية.

⚠️ مهم جدًا:
- لا تعتمد على التخمين أو التفسير العام
- لا تعتمد على كلمات مفردة فقط
- اعتمد فقط على نص واضح يحمل دلالة جنسية

=== ملاحظة لغوية مهمة ===
النص قد يكون بالفصحى أو باللهجات العربية (سعودي، مصري، شامي، وغيرها).

يجب فهم المعنى بغض النظر عن اللهجة.

أمثلة:
- "هيمسكها" قد تعني "يمسكها"
- "باسها" = "قبلها"
- "راح يقرب منها" قد تحمل إيحاء حسب السياق

المهم:
- فهم المعنى
- لكن استخراج النص يجب أن يكون حرفيًا كما ورد

=== تعريف المحتوى الجنسي ===
المحتوى الجنسي هو أي تعبير يتضمن:
- علاقة جسدية حميمة
- إيحاء واضح بالرغبة الجنسية
- وصف جسدي مثير بقصد جنسي
- تلامس جسدي ذو طابع جنسي

يشمل:
- التقبيل أو العناق الحميمي
- اللمس أو المداعبة ذات الطابع الجنسي
- وصف الجسد بقصد الإثارة
- تعبيرات الشهوة أو الرغبة الجنسية
- العلاقات غير الشرعية مع دلالة جسدية

قد يكون:
- مباشر (وصف واضح)
- غير مباشر (إيحاء قوي وواضح)

لا يشمل:
- الإهانات أو التقليل (مثل "مكانك السرير")
- التمييز الاجتماعي أو الجندري
- الحركات غير الجنسية (مثل الإشارة باليد)
- أي نص لا يحتوي دلالة جنسية واضحة

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع أي مخالفة إلا إذا كان النص نفسه يحتوي على دلالة جنسية واضحة.

=== قاعدة المطابقة النصية (حرجة جدًا) ===
- يجب أن يكون evidence_snippet نسخة حرفية 100% من النص
- يجب نسخ النص كما هو دون أي تعديل
- ممنوع إعادة الصياغة أو التلخيص
- ممنوع اختيار نص تقريبي

⚠️ أي اختلاف ولو حرف واحد يعتبر خطأ

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===
- كن محافظًا (precision > recall)
- لا تخمّن
- لا تستخدم السياق العام فقط
- لا تربط مشاهد ببعضها

=== أمثلة ===

✔ "اقترب منها وقبّلها" → محتوى جنسي
✔ "بدأ يلمس جسدها" → محتوى جنسي
✔ "نظراته كانت مليئة بالشهوة" → إيحاء جنسي

❌ "مكانك السرير" → ليس بالضرورة محتوى جنسي
❌ "أنت غبية" → إهانة
❌ "رفع إصبعه الأوسط" → ليس محتوى جنسي

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على دلالة جنسية واضحة؟
3. هل يمكن فهم الدلالة بدون تفسير إضافي؟

إذا كانت الإجابة "لا":
→ لا تُرجع النتيجة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على محتوى جنسي واضح أو إيحاء قوي.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildSexualContentUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تحتوي على الدلالة الجنسية
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على الوصف العام أو الاستنتاج

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن الدلالة الجنسية واضحة من النص نفسه

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 4: DRUGS & ALCOHOL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDrugsPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("SUBSTANCES");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف المخدرات والكحول في النصوص الدرامية.

⚠️ مهم جدًا:
- لا تعتمد على قائمة كلمات فقط
- لا تعتمد على كلمة واحدة بدون سياق
- اعتمد على المعنى الكامل للنص

=== ملاحظة لغوية مهمة ===
النص قد يكون بالفصحى أو باللهجات العربية (سعودي، مصري، شامي، وغيرها).

يجب فهم المعنى بغض النظر عن اللهجة.

أمثلة:
- "ضارب شبو" → تعاطي مخدرات
- "يشرب" → قد تعني كحول حسب السياق
- "بياخد حاجة" → قد تشير لمخدرات

المهم:
- فهم المعنى
- لكن استخراج النص يجب أن يكون حرفيًا

=== تعريف المخدرات والكحول ===
أي مادة تُستخدم لإحداث:
- تخدير
- نشوة
- تغيّر في الوعي
- سُكر أو حالة فقدان إدراك

يشمل:
- تعاطي المخدرات
- شرب الكحول
- الإدمان
- الترويج أو التشجيع
- تصوير إيجابي للتعاطي

قد يظهر:
- بشكل مباشر (ذكر مادة)
- بشكل غير مباشر (وصف حالة أو سلوك)

لا يشمل:
- الرفض أو التحذير من المخدرات
- الاستخدام الطبي
- ذكر غير مرتبط بسلوك تعاطي

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع مخالفة إلا إذا كان النص يشير بوضوح إلى تعاطي أو استخدام أو ترويج.

=== قاعدة المطابقة النصية (حرجة جدًا) ===
- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص تقريبي

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===
- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة فقط

=== أمثلة ===

✔ "كان يشرب الخمر" → كحول
✔ "ضارب شبو" → مخدرات
✔ "كان في حالة سُكر" → كحول

❌ "رفض تعاطي المخدرات" → ليس مخالفة
❌ "دواء من الطبيب" → ليس مخدر
❌ "كان يتكلم عن المخدرات" → ليس بالضرورة مخالفة

=== المطلوب ===
استخرج فقط العبارات التي تشير بوضوح إلى تعاطي أو استخدام أو ترويج.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildDrugsUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على التعاطي أو الاستخدام
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على التفسير العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن الدلالة واضحة

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 5: DISCRIMINATION & INCITEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDiscriminationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("DISCRIMINATION");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف التمييز والتحريض داخل النصوص الدرامية.

⚠️ مهم جدًا:
- لا تعتمد على الكلمات فقط
- لا تعتمد على التخمين
- اعتمد على المعنى الكامل للنص + دليل واضح

=== ملاحظة لغوية مهمة ===
النص قد يكون بالفصحى أو باللهجات العربية.

يجب فهم المعنى بغض النظر عن اللهجة.

أمثلة:
- "اطردوهم" → تحريض
- "هذولا أقل مننا" → تمييز
- "لا يستحقون الاحترام" → تمييز أو تحقير جماعي

المهم:
- فهم المعنى
- لكن استخراج النص يجب أن يكون حرفيًا

=== تعريف التمييز ===
أي تعبير يقلل من قيمة شخص أو مجموعة بناءً على:
- الدين
- العرق
- الطبقة الاجتماعية
- الانتماء

مثل:
- الاستعلاء ("أنتم أقل")
- الإذلال الجماعي

=== تعريف التحريض ===
أي دعوة أو تشجيع على:
- الكراهية
- العنف
- الإقصاء
- الأذى ضد شخص أو مجموعة

مثل:
- "اطردوهم"
- "لازم يتأدبون"
- "يستاهلون الضرب"

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع أي مخالفة إلا إذا كان النص يحتوي بشكل واضح على:
- تمييز مباشر
أو
- تحريض واضح

=== التمييز بين المسارات ===

❌ لا تُخرج:
- الإهانات الفردية → (insults)
- التهديد المباشر → (violence)
- أي تقليل أو تحقير مرتبط بالمرأة كـ "امرأة" أو "بنت" → (women)
- المحتوى الجنسي أو اللمس أو الوصف الجسدي → (sexual_content)

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص تقريبي

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة فقط
- لا تربط جمل متعددة

=== أمثلة ===

✔ "هذولا أقل مننا" → تمييز
✔ "اطردوهم من البلد" → تحريض

❌ "أنت غبي" → إهانة
❌ "أضربك" → عنف
❌ "مكانك المطبخ" → women
❌ "أنا زعلان" → ليس مخالفة

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على تمييز أو تحريض؟
3. هل يمكن فهم المعنى بدون تفسير إضافي؟

إذا كانت الإجابة "لا":
→ لا تُرجع النتيجة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على تمييز أو تحريض واضح.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildDiscriminationUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على التمييز أو التحريض
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على التفسير العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 6: WOMEN & DIGNITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildWomenPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("WOMEN");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف الانتهاكات المرتبطة بالمرأة وكرامتها في النصوص الدرامية.

⚠️ مهم جدًا:
- لا تعتمد على السياق العام
- لا تعتمد على فهم المشهد
- اعتمد فقط على النص الحرفي

=== ملاحظة لغوية مهمة ===
النص قد يكون بالفصحى أو باللهجات العربية.

يجب فهم المعنى، لكن:
- استخراج النص يجب أن يكون حرفيًا 100%

المواد المرتبطة بهذا المسار:
${articlePayload}

=== تعريف مخالفة المرأة ===
المخالفة تحدث فقط عندما يحتوي النص على:

- تقليل من قيمة المرأة بسبب كونها امرأة
- حصر دور المرأة في نطاق ضيق (مثل: المطبخ، البيت، السرير)
- نفي حق المرأة في القرار أو الكلام
- إهانة قائمة على النوع (gender-based degradation)
- فرض تبعية أو سيطرة بسبب كونها امرأة

=== يشمل ===

- "مكانك المطبخ"
- "ما لك كلمة"
- "المرأة مكانها البيت"
- "أنتِ بس للمطبخ والسرير"
- "البنت ما لها إلا كذا"

=== لا يشمل ===

❌ الإهانات العامة:
- "أنت غبية" (بدون سياق جندري واضح)

❌ التمييز العام:
- إذا كان ضد مجموعة غير محددة بالنساء

❌ المحتوى الجنسي:
- التلامس، الرغبة، الوصف الجسدي

❌ العنف:
- التهديد أو الضرب (إلا إذا النص نفسه يربطه بكونها امرأة)

=== القاعدة الأساسية ===

لا تُرجع أي نتيجة إلا إذا كان النص نفسه يحتوي على إهانة أو تقليل واضح للمرأة كـ "امرأة".

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- يجب أن يكون النص منسوخًا كما هو
- ممنوع إعادة الصياغة
- ممنوع اختيار نص قريب

⚠️ أي اختلاف ولو حرف واحد = خطأ

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا جدًا
- لا تخمّن
- لا تربط جمل متعددة
- لا تعتمد على التفسير
- canonical_atom لهذا المسار يجب أن تكون "WOMEN"

=== قاعدة عدم التداخل ===

❌ إذا كان النص:
- إهانة عامة → insults
- تهديد أو ضرب → violence
- محتوى جنسي → sexual_content
- تحريض ضد مجموعة → discrimination

→ لا تُرجع في هذا المسار

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على تقليل واضح للمرأة؟
3. هل يمكن فهم الإهانة بدون تفسير إضافي؟

إذا لا:
→ لا تُرجع النتيجة

=== حجم المقتطف ===

- يُسمح:
  ✔ كلمة
  ✔ جملة قصيرة
  ✔ جملة أطول

لكن فقط إذا:
→ النص نفسه يحتوي الدليل الكامل

=== المطلوب ===

استخرج فقط العبارات التي تحتوي على تقليل أو إهانة واضحة للمرأة كـ "امرأة".

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildWomenUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على الإهانة المرتبطة بالمرأة
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على السياق العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن الإهانة واضحة من النص نفسه

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 7: NATIONAL SECURITY & GOVERNANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildNationalSecurityPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("PUBLIC_ORDER");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف المحتوى الذي يمس الأمن الوطني.

⚠️ مهم جدًا:
- لا تعتمد على الكلمات فقط
- لا تعتمد على أسماء أو ألقاب فقط
- اعتمد على المعنى والسلوك

=== ملاحظة مهمة ===
وجود أسماء مثل:
- رتبة عسكرية
- رتبة شرطية
- "أمير"
- أسماء جماعات

لا يعني وجود مخالفة بحد ذاته.

يجب وجود:
- تهديد
- تحريض
- تقويض للنظام
- سلوك خطير

=== تعريف المخالفة ===
أي نص يتضمن:
- تهديد للأمن أو الاستقرار
- دعوة للفوضى أو التخريب
- تحريض على العنف أو التمرد
- دعم أو تمجيد سلوك خطير

يشمل:
- التخطيط لهجوم
- الترويج للعنف
- الدعوة لتقويض النظام
- تمجيد الفوضى

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع مخالفة إلا إذا كان النص يحتوي على:
- نية واضحة
أو
- دعوة صريحة
أو
- سلوك خطير

=== التمييز المهم ===

❌ لا تُخرج:
- ذكر أسماء أو ألقاب فقط
- وصف محايد لمؤسسات الدولة

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة

=== أمثلة ===

✔ "لازم نسوي تفجير" → تهديد
✔ "خلهم يطلعون للشارع" → تحريض
✔ "النظام لازم ينهار" → تقويض

❌ "هو عقيد في الجيش" → ليس مخالفة
❌ "قابل الأمير" → ليس مخالفة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على تهديد أو تحريض أو سلوك خطير واضح.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildNationalSecurityUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على التهديد أو التحريض
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 7: EXTREMISM & BANNED GROUPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildExtremismPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("EXTREMISM");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف الترويج للتطرف أو الجماعات المحظورة.

⚠️ مهم جدًا:
- لا تعتمد على وجود اسم جماعة فقط
- لا تعتمد على كلمات مفردة فقط
- اعتمد على نية النص (دعم / تمجيد / تبرير)

=== ملاحظة مهمة ===
وجود:
- اسم جماعة
- ذكر حدث إرهابي
- وصف جماعة

لا يعني وجود مخالفة بحد ذاته.

=== تعريف المخالفة ===
المخالفة تحدث فقط عندما يحتوي النص على:

- دعم مباشر أو غير مباشر
- تمجيد أو مدح
- تبرير الأفعال
- دعوة للانضمام أو التأييد

=== لا تشمل ===

- ذكر الجماعة بشكل محايد
- الحديث عنها بشكل نقدي أو سلبي
- وصف أحداث بدون دعم

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===
لا تُرجع مخالفة إلا إذا كان النص يحتوي على دعم أو تمجيد واضح.

=== التمييز المهم ===

❌ لا تُخرج:
- مجرد ذكر اسم جماعة
- وصف محايد
- تحليل أو نقد

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة
- ممنوع اختيار نص تقريبي

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على السياق فقط

=== أمثلة ===

✔ "هم أبطال" → تمجيد
✔ "لازم ندعمهم" → دعم
✔ "أفعالهم مبررة" → تبرير

❌ "قالوا الجماعة سوت كذا" → ذكر فقط
❌ "الجماعة خطيرة" → نقد

=== قاعدة التحقق قبل الإرجاع ===

قبل إرجاع أي نتيجة:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي النص نفسه على دعم أو تمجيد؟
3. هل يمكن فهم الدعم بدون تفسير؟

إذا كانت الإجابة "لا":
→ لا تُرجع النتيجة

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على دعم أو تمجيد أو تبرير واضح.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildExtremismUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على الدعم أو التمجيد
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على السياق العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود في النص
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 8: MISINFORMATION & CREDIBILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMisinformationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("MISINFORMATION");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف المعلومات المضللة والادعاءات غير الموثوقة.

⚠️ مهم جدًا:
- لا تعتمد على كلمات فقط
- لا تعتمد على النية فقط
- ركّز على الادعاءات التي تُقدَّم كحقيقة

=== ملاحظة مهمة ===
المطلوب ليس التحقق الكامل من صحة المعلومة،
بل تحديد أن النص يحتوي على:

- ادعاء
- معلومة تُعرض كحقيقة
- وصف تاريخي أو ديني أو سياسي

=== أنواع المحتوى ===

1. شائعات أو تضليل متعمد
2. ادعاءات بدون دليل
3. معلومات تاريخية أو دينية تُعرض كحقائق
4. تقديم رأي على أنه حقيقة

=== تعريف المخالفة ===

المخالفة تحدث عندما:
- يتم تقديم معلومة على أنها حقيقة
- ويكون هناك مؤشر أنها غير موثوقة أو مضللة

=== أمثلة على الادعاءات ===

- "التاريخ اللي تعلمناه كله كذب"
- "في أوامر سرية مخفية"
- "الحقيقة مختلفة تمامًا"
- ادعاءات عن أحداث تاريخية أو دينية

المواد المرتبطة بهذا المسار:
${articlePayload}

=== لا يشمل ===

- الرأي الشخصي الواضح
- الحوار العادي بدون ادعاء
- الأسئلة

=== القاعدة الأساسية ===

لا تُرجع نتيجة إلا إذا كان النص يحتوي على ادعاء واضح.

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تفترض صحة أو خطأ المعلومة

=== أمثلة ===

✔ "التاريخ كله كذب" → ادعاء مضلل
✔ "في أوامر سرية" → ادعاء غير موثق
✔ "الحقيقة مختلفة" → تضليل

❌ "أنا أعتقد" → رأي
❌ "هل هذا صحيح؟" → سؤال

=== قاعدة التحقق ===

قبل الإرجاع:

1. هل النص يحتوي على ادعاء؟
2. هل يُعرض كحقيقة؟
3. هل يمكن اعتباره مضلل أو غير موثق؟

إذا لا:
→ لا تُرجع

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على ادعاءات أو معلومات مضللة محتملة.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildMisinformationUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج العبارة التي تحتوي على الادعاء
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود
3. تأكد أنه ادعاء

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 9: INTERNATIONAL RELATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildInternationalPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("INTERNATIONAL");

  return `${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت محلل امتثال محتوى متخصص في كشف المحتوى الذي قد يسيء للعلاقات الدولية.

⚠️ مهم جدًا:
- لا تعتمد على مجرد ذكر دولة أو شعب
- لا تعتبر النقد أو الرأي مخالفة
- ركّز فقط على الإساءة أو التحريض أو التصعيد

=== ملاحظة مهمة ===
ذكر:
- دولة
- شعب
- حكومة

لا يعني وجود مخالفة بحد ذاته.

=== تعريف المخالفة ===
المخالفة تحدث عندما يحتوي النص على:

- إهانة أو تحقير لشعب أو دولة
- خطاب عدائي واضح
- دعوة للعداء أو الصراع
- تحريض على كراهية أو مواجهة دولية

=== لا يشمل ===

- النقد السياسي العادي
- الرأي الشخصي
- وصف محايد
- تحليل اقتصادي أو سياسي

المواد المرتبطة بهذا المسار:
${articlePayload}

=== القاعدة الأساسية ===

لا تُرجع مخالفة إلا إذا كان النص يحتوي على إساءة أو عداء واضح.

=== التمييز المهم ===

❌ لا تُخرج:
- معلومات عامة
- آراء غير عدائية
- تحليل سياسي

=== قاعدة المطابقة النصية (حرجة جدًا) ===

- يجب أن يكون evidence_snippet مطابقًا حرفيًا 100%
- ممنوع إعادة الصياغة

إذا لم تجد نصًا واضحًا:
→ لا تُرجع نتيجة

=== قواعد الدقة ===

- كن محافظًا
- لا تخمّن
- لا تعتمد على كلمة واحدة

=== أمثلة ===

✔ "هذولا شعب متخلف" → إساءة
✔ "لازم نحاربهم" → تحريض
✔ "ما يستاهلون الاحترام" → تحقير

❌ "عندهم مشاكل اقتصادية" → تحليل
❌ "أنا ما أحب سياستهم" → رأي

=== قاعدة التحقق ===

قبل الإرجاع:

1. هل النص منسوخ حرفيًا؟
2. هل يحتوي على إساءة أو عداء؟
3. هل المعنى واضح بدون تفسير؟

إذا لا:
→ لا تُرجع

=== المطلوب ===
استخرج فقط العبارات التي تحتوي على إساءة أو عداء أو تحريض واضح تجاه دول أو شعوب.

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

function buildInternationalUserPromptAddition(): string {
  return `=== STRICT EVIDENCE RULES ===

- يجب استخراج أصغر عبارة تدل على الإساءة أو العداء
- يجب أن يكون النص مطابقًا حرفيًا 100%
- يجب أن تتطابق offsets مع النص تمامًا
- لا تعتمد على السياق العام

قبل الإرجاع:
1. انسخ النص حرفيًا
2. تأكد أنه موجود
3. تأكد أن المعنى واضح

إذا لم توجد مخالفات:
{ "findings": [] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DETECTION_PASSES: PassDefinition[] = [
  {
    name: "glossary",
    articleIds: [], // Will be populated from lexicon terms
    buildPrompt: buildGlossaryPrompt,
    model: "gpt-4.1-mini", // Cheap model for simple lexicon matching
  },
  {
    name: "insults",
    articleIds: [4, 5, 7, 17],
    buildPrompt: buildInsultsPrompt,
    model: "gpt-4.1-mini", // Cheap model for simple word matching
  },
  {
    name: "violence",
    articleIds: [4, 9, 10],
    buildPrompt: buildViolencePrompt,
    model: "gpt-4.1-mini", // Cheap model for simple word matching
  },
  {
    name: "sexual_content",
    articleIds: [9, 23, 24],
    buildPrompt: buildSexualContentPrompt,
    model: "gpt-4.1", // Expensive model for nuanced detection
  },
  {
    name: "drugs_alcohol",
    articleIds: [11, 12],
    buildPrompt: buildDrugsPrompt,
    model: "gpt-4.1-mini", // Cheap model for simple word matching
  },
  {
    name: "discrimination_incitement",
    articleIds: [5, 6, 8, 13, 17],
    buildPrompt: buildDiscriminationPrompt,
    model: "gpt-4.1", // Expensive model for nuanced detection
  },
  {
    name: "women",
    articleIds: [7],
    buildPrompt: buildWomenPrompt,
    model: "gpt-4.1", // Needs clean separation from discrimination/sexual/violence
  },
  {
    name: "national_security",
    articleIds: [4, 12, 13, 14],
    buildPrompt: buildNationalSecurityPrompt,
    model: "gpt-4.1", // High sensitivity, needs nuance
  },
  {
    name: "extremism_banned_groups",
    articleIds: [9, 14, 15],
    buildPrompt: buildExtremismPrompt,
    model: "gpt-4.1", // High sensitivity
  },
  {
    name: "misinformation",
    articleIds: [11, 16, 19, 20, 21, 22],
    buildPrompt: buildMisinformationPrompt,
    model: "gpt-4.1", // Needs context understanding
  },
  {
    name: "international_relations",
    articleIds: [18, 22],
    buildPrompt: buildInternationalPrompt,
    model: "gpt-4.1", // Diplomatic sensitivity
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXECUTION ENGINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PassResult {
  passName: string;
  findings: JudgeFinding[];
  duration: number;
  skipped?: boolean;
  reason?: string;
  matchedSignals?: string[];
  model?: string;
  error?: string;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  const error = new Error(typeof reason === "string" ? reason : "Operation aborted");
  error.name = "AbortError";
  throw error;
}

function buildAbortError(reason: unknown, fallbackMessage = "Operation aborted"): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(typeof reason === "string" ? reason : fallbackMessage);
  error.name = "AbortError";
  return error;
}

export interface DetectionPassExecutionPlan {
  activePasses: PassDefinition[];
  skippedPasses: PlannedPassSkip[];
}

function getPassArticleIds(pass: PassDefinition, lexiconTerms: LexiconTerm[]): number[] {
  if (pass.name === "glossary" && lexiconTerms.length > 0) {
    return [...new Set(lexiconTerms.map((t) => t.gcam_article_id))];
  }
  return pass.articleIds;
}

function sortPassResultsStable(results: PassResult[]): PassResult[] {
  const order = new Map(DETECTION_PASSES.map((pass, index) => [pass.name, index]));
  return [...results].sort((a, b) => (order.get(a.passName) ?? 999) - (order.get(b.passName) ?? 999));
}

export function planDetectionPassExecution(
  chunkText: string,
  allArticles: GCAMArticle[],
  lexiconTerms: LexiconTerm[]
): DetectionPassExecutionPlan {
  const activePasses: PassDefinition[] = [];
  const skippedPasses: PlannedPassSkip[] = [];

  for (const pass of DETECTION_PASSES) {
    const articleIds = getPassArticleIds(pass, lexiconTerms);
    const articles = allArticles.filter((article) => articleIds.includes(article.id));

    if (pass.name === "glossary" && lexiconTerms.length === 0) {
      skippedPasses.push({ passName: pass.name, reason: "no_lexicon_terms", model: pass.model });
      continue;
    }

    if (articles.length === 0 && pass.name !== "glossary") {
      skippedPasses.push({ passName: pass.name, reason: "no_articles", model: pass.model });
      continue;
    }

    const gating = evaluatePassGating(pass.name, chunkText, pass.model);
    if (!gating.shouldRun) {
      skippedPasses.push({
        passName: pass.name,
        reason: gating.reason,
        matchedSignals: gating.matchedSignals,
        model: pass.model,
      });
      continue;
    }

    activePasses.push(pass);
  }

  return { activePasses, skippedPasses };
}

/**
 * Run a single detection pass
 */
async function runSinglePass(
  chunkText: string,
  chunkStart: number,
  chunkEnd: number,
  pass: PassDefinition,
  allArticles: GCAMArticle[],
  lexiconTerms: LexiconTerm[],
  jobConfig: { temperature: number; seed: number },
  promptContext?: string,
  signal?: AbortSignal
): Promise<PassResult> {
  const startTime = Date.now();
  
  try {
    throwIfAborted(signal);
    // Get articles for this pass
    let articleIds = pass.articleIds;
    if (pass.name === "glossary" && lexiconTerms.length > 0) {
      // For glossary pass, use articles from lexicon terms
      articleIds = [...new Set(lexiconTerms.map(t => t.gcam_article_id))];
    }
    
    const articles = allArticles.filter(a => articleIds.includes(a.id));
    
    if (articles.length === 0 && pass.name !== "glossary") {
      logger.warn(`[DEBUG] Pass skipped: no articles`, { passName: pass.name, articleIds, allArticleIds: allArticles.map(a => a.id) });
      return { passName: pass.name, findings: [], duration: 0, skipped: true, reason: "no_articles", model: pass.model };
    }

    // Skip glossary pass if no lexicon terms
    if (pass.name === "glossary" && lexiconTerms.length === 0) {
      logger.info("Skipping glossary pass (no lexicon terms)");
      return { passName: pass.name, findings: [], duration: 0, skipped: true, reason: "no_lexicon_terms", model: pass.model };
    }

    // Build specialized prompt
    const promptBase = pass.buildPrompt(articles, lexiconTerms);
    const promptVersioned = applyViolationSystemOverlay(promptBase, pass.name);
    const prompt = promptContext && promptContext.trim().length > 0
      ? `${promptVersioned}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nسياق إضافي للمراجعة (Pipeline V2)\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n${promptContext.trim()}`
      : promptVersioned;
    const userPromptAddition =
      pass.name === "insults"
        ? buildInsultsUserPromptAddition()
        : pass.name === "violence"
          ? buildViolenceUserPromptAddition()
          : pass.name === "sexual_content"
            ? buildSexualContentUserPromptAddition()
            : pass.name === "drugs_alcohol"
              ? buildDrugsUserPromptAddition()
              : pass.name === "discrimination_incitement"
                ? buildDiscriminationUserPromptAddition()
                : pass.name === "women"
                  ? buildWomenUserPromptAddition()
                  : pass.name === "national_security"
                    ? buildNationalSecurityUserPromptAddition()
                    : pass.name === "extremism_banned_groups"
                      ? buildExtremismUserPromptAddition()
                      : pass.name === "misinformation"
                        ? buildMisinformationUserPromptAddition()
                        : pass.name === "international_relations"
                          ? buildInternationalUserPromptAddition()
                          : null;
    
    // Call OpenAI with specialized prompt
    const model = pass.model || "gpt-4.1";
    const raw = await callJudgeRaw(
      chunkText,
      articles,
      chunkStart,
      chunkEnd,
      { judge_model: model, temperature: jobConfig.temperature, seed: jobConfig.seed },
      prompt,
      userPromptAddition,
      { signal }
    );
    throwIfAborted(signal);

    // Parse findings
    const { findings } = await parseJudgeWithRepair(raw, model, { signal });
    const tagged = findings.map((f) => ({
      ...f,
      detection_pass: pass.name,
      depiction_type: f.depiction_type ?? "unknown",
      speaker_role: f.speaker_role ?? "unknown",
      context_window_id: f.context_window_id ?? null,
      context_confidence: f.context_confidence ?? null,
      lexical_confidence: f.lexical_confidence ?? null,
      policy_confidence: f.policy_confidence ?? null,
      rationale_ar: f.rationale_ar ?? null,
      final_ruling: f.final_ruling ?? null,
      narrative_consequence: f.narrative_consequence ?? "unknown",
    })).map((f) => normalizeFindingForPass(f, articles));
    const stableTagged = sortJudgeFindingsStable(tagged);
    
    const duration = Date.now() - startTime;
    logger.info(`Pass ${pass.name} completed`, { 
      findingsCount: stableTagged.length, 
      duration,
      model
    });

    return { passName: pass.name, findings: stableTagged, duration, model };
    
  } catch (error) {
    if (
      (error instanceof Error && (error.name === "AbortError" || error.name === "ChunkTimeoutError")) ||
      signal?.aborted
    ) {
      throwIfAborted(signal);
      throw error;
    }
    const duration = Date.now() - startTime;
    logger.error(`Pass ${pass.name} failed`, { error: String(error), duration });
    return { passName: pass.name, findings: [], duration, error: String(error) };
  }
}

/**
 * Deduplicate findings from multiple passes
 * Keep the finding with highest confidence for each unique violation
 */
function deduplicateFindings(allFindings: JudgeFinding[]): JudgeFinding[] {
  const seen = new Map<string, JudgeFinding>();
  
  for (const finding of allFindings) {
    // Create unique key based on article, location, and evidence
    const evidenceKey = finding.evidence_snippet?.slice(0, 50) || "";
    const key = `${finding.article_id}-${finding.location.start_offset}-${evidenceKey}`;
    
    const existing = seen.get(key);
    if (!existing || compareJudgeFindingPreference(finding, existing) < 0) {
      seen.set(key, finding);
    }
  }
  
  return sortJudgeFindingsStable(Array.from(seen.values()));
}

async function runSinglePassWithHardTimeout(
  chunkText: string,
  chunkStart: number,
  chunkEnd: number,
  pass: PassDefinition,
  allArticles: GCAMArticle[],
  lexiconTerms: LexiconTerm[],
  jobConfig: { temperature: number; seed: number },
  promptContext?: string,
  signal?: AbortSignal
): Promise<PassResult> {
  return new Promise<PassResult>((resolve, reject) => {
    throwIfAborted(signal);
    const passAbortController = new AbortController();
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const resolveOnce = (result: PassResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => {
      const error = buildAbortError(signal?.reason);
      passAbortController.abort(error);
      rejectOnce(error);
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    const timer = setTimeout(() => {
      const error = new Error(`Pass ${pass.name} hard timeout`);
      error.name = "PassTimeoutError";
      passAbortController.abort(error);
      logger.error(`Pass ${pass.name} exceeded hard timeout`, {
        timeoutMs: config.PASS_HARD_TIMEOUT_MS,
        model: pass.model ?? "gpt-4.1",
      });
      resolveOnce({
        passName: pass.name,
        findings: [],
        duration: config.PASS_HARD_TIMEOUT_MS,
        error: "hard_timeout",
        reason: "hard_timeout",
        model: pass.model ?? "gpt-4.1",
      });
    }, config.PASS_HARD_TIMEOUT_MS);

    runSinglePass(chunkText, chunkStart, chunkEnd, pass, allArticles, lexiconTerms, jobConfig, promptContext, passAbortController.signal).then(
      (result) => {
        resolveOnce(result);
      },
      (error) => {
        if (
          (error instanceof Error && (error.name === "AbortError" || error.name === "ChunkTimeoutError")) ||
          signal?.aborted ||
          passAbortController.signal.aborted
        ) {
          rejectOnce(error);
          return;
        }
        logger.error(`Pass ${pass.name} crashed unexpectedly`, {
          error: String(error),
          model: pass.model ?? "gpt-4.1",
        });
        resolveOnce({
          passName: pass.name,
          findings: [],
          duration: 0,
          error: String(error),
          reason: "unexpected_error",
          model: pass.model ?? "gpt-4.1",
        });
      }
    );
  });
}

/**
 * Run multi-pass detection on a chunk
 * Returns deduplicated findings from all passes
 */
export async function runMultiPassDetection(
  chunkText: string,
  chunkStart: number,
  chunkEnd: number,
  allArticles: GCAMArticle[],
  lexiconTerms: LexiconTerm[],
  jobConfig: { temperature: number; seed: number },
  progressOpts?: { chunkId: string },
  executionPlan?: DetectionPassExecutionPlan,
  promptContext?: string,
  signal?: AbortSignal
): Promise<{
  findings: JudgeFinding[];
  passResults: PassResult[];
  totalDuration: number;
  executedPassCount: number;
  skippedPassCount: number;
}> {
  const startTime = Date.now();
  throwIfAborted(signal);
  const plan = executionPlan ?? planDetectionPassExecution(chunkText, allArticles, lexiconTerms);
  const totalPasses = plan.activePasses.length;

  logger.info("[DEBUG] runMultiPassDetection started", {
    chunkTextLength: chunkText.length,
    chunkStart,
    chunkEnd,
    allArticlesCount: allArticles.length,
    allArticleIds: allArticles.map(a => a.id),
    lexiconTermsCount: lexiconTerms.length,
    passCount: DETECTION_PASSES.length,
    activePassCount: plan.activePasses.length,
    skippedPassCount: plan.skippedPasses.length,
    hasPromptContext: Boolean(promptContext && promptContext.trim().length > 0),
  });
  
  logger.info("Starting multi-pass detection", { 
    chunkStart, 
    chunkEnd, 
    passCount: DETECTION_PASSES.length,
    activePassCount: plan.activePasses.length,
    skippedPassCount: plan.skippedPasses.length,
    lexiconTermsCount: lexiconTerms.length,
    hasPromptContext: Boolean(promptContext && promptContext.trim().length > 0),
  });

  for (const skipped of plan.skippedPasses) {
    logger.info("Pass skipped by execution planner", {
      passName: skipped.passName,
      reason: skipped.reason,
      model: skipped.model ?? null,
      matchedSignals: skipped.matchedSignals ?? [],
    });
  }

  if (plan.activePasses.length === 0) {
    if (progressOpts?.chunkId) {
      await flushChunkPassProgress(progressOpts.chunkId, 0, 0);
    }
    return {
      findings: [],
      passResults: sortPassResultsStable(
        plan.skippedPasses.map((skipped) => ({
          passName: skipped.passName,
          findings: [],
          duration: 0,
          skipped: true,
          reason: skipped.reason,
          matchedSignals: skipped.matchedSignals,
          model: skipped.model,
        }))
      ),
      totalDuration: Date.now() - startTime,
      executedPassCount: 0,
      skippedPassCount: plan.skippedPasses.length,
    };
  }

  // Run planned passes in parallel (completion order is arbitrary; UI shows debounced count)
  let completed = 0;
  const activeResults = await Promise.all(
    plan.activePasses.map((pass) =>
      runSinglePassWithHardTimeout(chunkText, chunkStart, chunkEnd, pass, allArticles, lexiconTerms, jobConfig, promptContext, signal).then(
        (result) => {
          completed++;
          if (progressOpts?.chunkId) {
            reportChunkPassProgressDebounced(progressOpts.chunkId, completed, totalPasses);
          }
          return result;
        }
      )
    )
  );
  throwIfAborted(signal);

  if (progressOpts?.chunkId) {
    await flushChunkPassProgress(progressOpts.chunkId, totalPasses, totalPasses);
  }

  const passResults = sortPassResultsStable([
    ...activeResults,
    ...plan.skippedPasses.map((skipped) => ({
      passName: skipped.passName,
      findings: [],
      duration: 0,
      skipped: true,
      reason: skipped.reason,
      matchedSignals: skipped.matchedSignals,
      model: skipped.model,
    })),
  ]);

  // Collect all findings
  const allFindings = activeResults.flatMap(r => r.findings);
  
  // Deduplicate
  const deduplicated = deduplicateFindings(allFindings);
  
  const totalDuration = Date.now() - startTime;
  
  logger.info("Multi-pass detection completed", {
    totalFindings: allFindings.length,
    afterDedup: deduplicated.length,
    dropped: allFindings.length - deduplicated.length,
    totalDuration,
    executedPassCount: activeResults.length,
    skippedPassCount: plan.skippedPasses.length,
    passResults: passResults.map(r => ({
      pass: r.passName,
      findings: r.findings.length,
      duration: r.duration,
      skipped: r.skipped ?? false,
      reason: r.reason ?? null,
    }))
  });
  
  if (deduplicated.length === 0) {
    logger.warn("[DEBUG] Multi-pass returned ZERO findings", {
      chunkStart,
      chunkEnd,
      totalPassFindings: allFindings.length,
      passBreakdown: passResults.map(r => ({ pass: r.passName, count: r.findings.length })),
    });
  }

  return {
    findings: deduplicated,
    passResults,
    totalDuration,
    executedPassCount: activeResults.length,
    skippedPassCount: plan.skippedPasses.length,
  };
}
