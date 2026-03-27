/**
 * Multi-Pass Detection System
 * 
 * Uses 10 specialized scanners instead of 1 complex prompt:
 * - Pass 0: Glossary (Lexicon terms from database)
 * - Pass 1: Insults & Profanity
 * - Pass 2: Violence & Threats
 * - Pass 3: Sexual Content
 * - Pass 4: Drugs & Alcohol
 * - Pass 5: Discrimination & Incitement
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
2. اشرح باختصار: أين يظهر المقتطف في النص، ما اللفظ أو السلوك الذي تم رصده، ولماذا يندرج تحت المادة.
3. اذكر سبباً قانونياً أو دلالياً واضحاً، لا مجرد إعادة صياغة النص.
4. ممنوع التعليل العام مثل: "يحتوي النص على مخالفة" أو "وجود لفظ مخالف" دون شرح.
5. إذا كان المقتطف حواراً أو وصفاً أو تهديداً أو إهانة مباشرة فاذكر ذلك صراحة.`;

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
في title_ar اكتب دائماً: "مخالفة معجمية: [اللفظ كما ورد]" — لا تنسخ عنواناً عاماً دون ذكر اللفظ.

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
      "title_ar": "مخالفة معجمية: نصاب",
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

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف ألفاظ مسيئة وشتائم.

الألفاظ المسيئة التي تبحث عنها:
نصاب، حرامي، كذاب، لص، محتال، نذل، خسيس، حقير، وضيع، وسخ، قذر، قبيح، لئيم، جبان، غبي، أحمق، ساذج، أبله، معتوه، مجنون (بمعنى مهين)، حيوان، كلب، حمار، خنزير، قرد، حمارة، فاشل، انجاس، طز، حشرية، عديم التربية، أي شتيمة، أي سب، أي قذف، أي إهانة شخصية، أي تحقير، أي استهزاء، أي سخرية مهينة، ابن الـ..., بنت الـ..., يا ابن..., يا بنت..., "العن أمك"، "العن والديك"، "موتو و خلصوني"، "كلهم حرامية"، "كلاب و انجاس"، "طز فيكم"، "يلعن امها"

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص كلمة بكلمة
2. ابحث عن أي لفظ مسيء أو شتيمة أو اتهام مهين مباشر في الحوار
3. إذا وجدت لفظاً مسيئاً، أخرج مخالفة (أخرج مخالفة منفصلة لكل موضع إن أمكن)
4. في evidence_snippet أرجع العبارة المهينة القصيرة فقط (لا تُرجع فقرة طويلة)

قاعدة: أي لفظ يمس الكرامة أو يحقر أو يهين = مخالفة.

أمثلة إلزامية يجب اعتبارها مخالفة:
- "أنت مجرد نصاب" / "يا نصاب" / "هو حرامي / كذاب / محتال"
- "عديم التربية" / "غبي" / "فاشل" / "حمارة" / "حشرية"
- "كلاب و انجاس" / "طز فيكم" / "طز فيهم" / "كلهم حرامية"
- "العن أمك" / "العن والديك" / "موتو و خلصوني منكم"
- "يلعن امها دولة" / أي سب أو لعن

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 2: VIOLENCE & THREATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildViolencePrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("VIOLENCE");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف عنف وتهديدات.

أوصاف العنف التي تبحث عنها:
ضرب، صفع، ركل، لكم، دفع، رفس، خنق، عض، قتل، ذبح، طعن، إطلاق نار، قنص، إعدام، تعذيب، إيذاء، جرح، ضرب مبرح، اعتداء، هجوم، دماء، دم، نزيف، جريمة، قتال، معركة، شجار، عراك، مبارزة، سلاح، سكين، سيف، مسدس، بندقية، رشاش، قنبلة، متفجرات، تهديد بالقتل، تهديد بالإيذاء، وعيد بالعنف، ترهيب، تخويف بالعنف.
عنف أسري، عنف ضد الطفل، ضرب الطفل، إيذاء الطفل، تهديد بالضرب، "اخذ الجزمة"، "اضربك"، "حضربك"، "باضربك"، "الجزمة و اضربك"، "يفهم بالضرب"، "ينكسر"، "يمسك أذنه"، "بضرب بعصى"، "عصى على راسه"، "عنفني و ضربني"، "عورني فراسي"، عنف في المدرسة، "الرجال اللي يضرب… بكرة يقتل"، "و الله بقتلك"، "بقتلك"، "يمسك ذراعها"، "يدفع سامي بقوة فيقع"

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص جملة بجملة
2. ابحث عن أي وصف للعنف أو تهديد أو إيذاء (حتى في الحوار أو الوصف)
3. إذا وجدت عنفاً أو تهديداً، أخرج مخالفة (أخرج مخالفة لكل موضع مميز)

قاعدة: أي وصف لإيذاء جسدي أو تهديد بالضرب/القتل = مخالفة. لا تتساهل.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 3: SEXUAL CONTENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSexualContentPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("SEXUAL");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف محتوى جنسي.

المحتوى الجنسي الذي تبحث عنه:
إيحاء جنسي، تلميح جنسي، غزل فاضح، وصف جسدي مثير، تركيز على الجسد، وصف الصدر، وصف الأرداف، وصف المفاتن، زنا، خيانة زوجية، علاقة غير شرعية، علاقة محرمة، عشيق، عشيقة، خليل، خليلة، قبلة، قبل، تقبيل، عناق حميمي، عناق مثير، لمس مثير، مداعبة، ملامسة جسدية، أي لفظ جنسي، شهوة، رغبة جنسية، إغراء، إثارة، إغواء، فتنة جسدية، عري، تعري، ملابس فاضحة، مشهد حميمي، مشهد ساخن

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي محتوى جنسي
2. ابحث عن إيحاءات، أوصاف، تلميحات
3. إذا وجدت محتوى جنسياً، أخرج مخالفة

قاعدة: أي محتوى جنسي أو إيحاء = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 4: DRUGS & ALCOHOL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDrugsPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("SUBSTANCES");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف مخدرات وكحول.

المخدرات والكحول التي تبحث عنها:
مخدرات، مخدر، حشيش، ماريجوانا، بانجو، كوكايين، هيروين، حبوب مخدرة، حبوب هلوسة، مواد مخدرة، تعاطي، يتعاطى، متعاطي، مدمن، إدمان، مدمن مخدرات، خمر، كحول، مشروبات كحولية، نبيذ، بيرة، ويسكي، فودكا، عرق، شرب الخمر، يشرب الخمر، سكران، ثمل، مخمور، سُكر، حالة سُكر، ترويج المخدرات، تصوير إيجابي للمخدرات، تشجيع على التعاطي، حفلة شرب، بار، حانة

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي ذكر للمخدرات أو الكحول
2. ابحث عن تعاطي، ترويج، تصوير
3. إذا وجدت ذكراً للمخدرات أو الكحول، أخرج مخالفة

قاعدة: أي ذكر للمخدرات أو الكحول = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 5: DISCRIMINATION & INCITEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDiscriminationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("DISCRIMINATION");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف تمييز وتحريض.

التمييز والتحريض الذي تبحث عنه:
تمييز عنصري، تمييز عرقي، تمييز لوني، عبد، رقيق، عبودية، تمييز جندري، تمييز ضد المرأة، تمييز ضد الرجل، احتقار المرأة، تحقير المرأة، "مكان البنت المطبخ"، "مكانك المطبخ والسرير"، "انتي ملك هنا"، "انتي بس مكانك المطبخ و السرير و بس"، تمييز ديني، تمييز طائفي، تمييز مذهبي، احتقار ديني، كفر، كافر (بمعنى مهين)، تمييز طبقي، تمييز اجتماعي، احتقار الفقراء، استعلاء طبقي، تحريض على العنف، تحريض على الكراهية، دعوة للقتل، دعوة للعنف، خطاب كراهية، كراهية عنصرية، كراهية دينية، تطرف، غلو، تشدد، تكفير، دعوة للفتنة، إثارة الفتنة، فتنة طائفية، تحريض طائفي

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي تمييز أو تحريض أو احتقار للمرأة/الطفل
2. ابحث عن "مكان البنت"، "المطبخ و بس"، "انتي ملك"، احتقار، استعلاء، كراهية، دعوات للعنف
3. إذا وجدت تمييزاً أو تحريضاً، أخرج مخالفة

قاعدة: أي تمييز جندري أو تحقير للمرأة أو تحريض = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 6: NATIONAL SECURITY & GOVERNANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildNationalSecurityPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("PUBLIC_ORDER");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف محتوى يمس الأمن الوطني أو ثوابت الحكم.

المحتوى الذي تبحث عنه:
المساس بالأمن الوطني، تهديد الأمن، الإضرار بالأمن، الإساءة للرموز الوطنية، الإساءة للعلم، الإساءة للنشيد الوطني، الإساءة لثوابت الحكم، التشكيك في نظام الحكم، التحريض على قلب نظام الحكم، الدعوة لتغيير نظام الحكم، إهانة مؤسسات الحكم، التقليل من مؤسسات الدولة، الإخلال بالنظام العام، تمجيد الفوضى، تقويض الاستقرار، التحريض على الإخلال بالنظام، الدعوة لتجاوز الأنظمة، تقويض التعايش، تقويض السلم المجتمعي، الإخلال بالوحدة الوطنية، إثارة الفتنة الوطنية

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي محتوى يمس الأمن أو ثوابت الحكم
2. ابحث عن تحريض، تشكيك، إساءة للرموز
3. إذا وجدت محتوى يمس الأمن الوطني، أخرج مخالفة

قاعدة: أي محتوى يمس الأمن أو ثوابت الحكم = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 7: EXTREMISM & BANNED GROUPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildExtremismPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("EXTREMISM");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف تطرف وجماعات محظورة.

المحتوى الذي تبحث عنه:
الترويج للجماعات المحظورة، الترويج للإرهاب، تمجيد الإرهاب، التعاطف مع الإرهابيين، شرعنة الإرهاب، الترويج للتطرف، الترويج للتشدد، الترويج للغلو، استخدام رموز الجماعات المحظورة، استخدام شعارات الجماعات المحظورة، خطاب الجماعات المحظورة، شرعنة الانتماء للجماعات المحظورة، التطبيع مع الجماعات المحظورة، تبرير أعمال الإرهاب، تبرير العنف السياسي، الدعوة للعنف السياسي

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي ترويج للتطرف أو الجماعات المحظورة
2. ابحث عن تمجيد، شرعنة، تطبيع، رموز، شعارات
3. إذا وجدت محتوى متطرفاً، أخرج مخالفة

قاعدة: أي ترويج للتطرف أو الجماعات المحظورة = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 8: MISINFORMATION & CREDIBILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMisinformationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("MISINFORMATION");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف معلومات مضللة وشائعات وتحريض.

المحتوى الذي تبحث عنه:
معلومات مضللة، معلومات غير دقيقة، شائعات، أكاذيب، "أوامر سرية"، "كذب في كذب"، "كلهم كذابين"، حسابات وهمية، نكتب إشاعات، نركب قصص، فساد وتستر، تحريض، "يشعلها"، "المدينة تحترق"، "انقلاب في البلد"، "بلبلة"، "خل الناس تعرف… خلهم يكرهون… خلهم يطلعون للشارع"، "الناس تصدق اللي يخوفها"، "نخوفهم أكثر"، تقديم الرأي على أنه حقيقة، تحريف، كشف وثائق سرية، "احذفوا كل شيء… واحرقوا الحسابات"

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي تحريض أو شائعات أو تخطيط لنشر أخبار كاذبة
2. ابحث عن "أوامر سرية"، إشاعات، حسابات وهمية، تحريض على الفوضى، "فوق القانون"
3. إذا وجدت محتوى تحريضياً أو مضللاً، أخرج مخالفة

قاعدة: أي تحريض أو شائعات أو ترويج لأكاذيب = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 9: INTERNATIONAL RELATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildInternationalPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);
  const frameworkBlock = getFrameworkPromptSection("INTERNATIONAL");

  return `${MAX_DETECTION_NOTE}

${frameworkBlock}

${STRUCTURED_RATIONALE_INSTRUCTIONS}

أنت كاشف محتوى يمس العلاقات الدولية.

المحتوى الذي تبحث عنه:
الإساءة إلى الدول، الإساءة إلى الشعوب، الإساءة إلى الكيانات الدولية، الإساءة إلى الحكومات الأجنبية، الإضرار بالمصالح المشتركة، الإضرار بالعلاقات الدبلوماسية، إثارة التوترات الإقليمية، إثارة التوترات الدولية، تشويه السياسة الخارجية، معلومات غير دقيقة عن الاتفاقيات، الإساءة للاتفاقيات الدولية، الإساءة للمعاهدات، تشويه الالتزامات الدولية، استخدام الدراما للإساءة الدبلوماسية

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي محتوى يمس العلاقات الدولية
2. ابحث عن إساءات، تشويه، إثارة توترات
3. إذا وجدت محتوى يمس العلاقات الدولية، أخرج مخالفة

قاعدة: أي محتوى يمس العلاقات الدولية = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [ { "rationale_ar": "..." } ] }`;
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
    articleIds: [5, 6, 7, 8, 13, 17],
    buildPrompt: buildDiscriminationPrompt,
    model: "gpt-4.1", // Expensive model for nuanced detection
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
  jobConfig: { temperature: number; seed: number }
): Promise<PassResult> {
  const startTime = Date.now();
  
  try {
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
    const prompt = pass.buildPrompt(articles, lexiconTerms);
    
    // Call OpenAI with specialized prompt
    const model = pass.model || "gpt-4.1";
    const raw = await callJudgeRaw(
      chunkText,
      articles,
      chunkStart,
      chunkEnd,
      { judge_model: model, temperature: jobConfig.temperature, seed: jobConfig.seed },
      prompt
    );

    // Parse findings
    const { findings } = await parseJudgeWithRepair(raw, model);
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
  executionPlan?: DetectionPassExecutionPlan
): Promise<{
  findings: JudgeFinding[];
  passResults: PassResult[];
  totalDuration: number;
  executedPassCount: number;
  skippedPassCount: number;
}> {
  const startTime = Date.now();
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
  });
  
  logger.info("Starting multi-pass detection", { 
    chunkStart, 
    chunkEnd, 
    passCount: DETECTION_PASSES.length,
    activePassCount: plan.activePasses.length,
    skippedPassCount: plan.skippedPasses.length,
    lexiconTermsCount: lexiconTerms.length 
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
      flushChunkPassProgress(progressOpts.chunkId, 0, 0);
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
      runSinglePass(chunkText, chunkStart, chunkEnd, pass, allArticles, lexiconTerms, jobConfig).then(
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

  if (progressOpts?.chunkId) {
    flushChunkPassProgress(progressOpts.chunkId, totalPasses, totalPasses);
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
