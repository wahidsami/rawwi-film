/**
 * Multi-Pass Detection System
 * 
 * Uses 6 specialized scanners instead of 1 complex prompt:
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

export interface LexiconTerm {
  term: string;
  gcam_article_id: number;
  severity_floor: string;
  gcam_article_title_ar?: string;
}

export interface PassDefinition {
  name: string;
  articleIds: number[];
  buildPrompt: (articles: GCAMArticle[], lexiconTerms?: LexiconTerm[]) => string;
  model?: string; // Optional: override model for this pass
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 0: GLOSSARY (Lexicon Terms)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildGlossaryPrompt(articles: GCAMArticle[], lexiconTerms: LexiconTerm[]): string {
  const lexiconList = lexiconTerms.map(t => `"${t.term}"`).join('، ');
  const lexiconDetails = lexiconTerms
    .map(t => `- "${t.term}" → المادة ${t.gcam_article_id} | الشدة: ${t.severity_floor}`)
    .join('\n');
  
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف ألفاظ محظورة من المعجم.

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

أرجع JSON:
{
  "findings": [
    {
      "article_id": 5,
      "atom_id": "5-1",
      "title_ar": "لفظ محظور من المعجم",
      "description_ar": "وجود لفظ 'نصاب' في النص",
      "severity": "high",
      "confidence": 1.0,
      "is_interpretive": false,
      "evidence_snippet": "أنت مجرد نصاب",
      "location": { "start_offset": 123, "end_offset": 145, "start_line": 10, "end_line": 10 }
    }
  ]
}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 1: INSULTS & PROFANITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildInsultsPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف ألفاظ مسيئة وشتائم.

الألفاظ المسيئة التي تبحث عنها:
نصاب، حرامي، كذاب، لص، محتال، نذل، خسيس، حقير، وضيع، وسخ، قذر، قبيح، لئيم، جبان، غبي، أحمق، ساذج، أبله، معتوه، مجنون (بمعنى مهين)، حيوان، كلب، حمار، خنزير، قرد، أي شتيمة، أي سب، أي قذف، أي إهانة شخصية، أي تحقير، أي استهزاء، أي سخرية مهينة، ابن الـ..., بنت الـ..., يا ابن..., يا بنت...

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص كلمة بكلمة
2. ابحث عن أي لفظ مسيء أو شتيمة
3. إذا وجدت لفظاً مسيئاً، أخرج مخالفة

قاعدة: أي لفظ يمس الكرامة أو يحقر أو يهين = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 2: VIOLENCE & THREATS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildViolencePrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف عنف وتهديدات.

أوصاف العنف التي تبحث عنها:
ضرب، صفع، ركل، لكم، دفع، رفس، خنق، عض، قتل، ذبح، طعن، إطلاق نار، قنص، إعدام، تعذيب، إيذاء، جرح، ضرب مبرح، اعتداء، هجوم، دماء، دم، نزيف، جريمة، قتال، معركة، شجار، عراك، مبارزة، سلاح، سكين، سيف، مسدس، بندقية، رشاش، قنبلة، متفجرات، تهديد بالقتل، تهديد بالإيذاء، وعيد بالعنف، ترهيب، تخويف بالعنف

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص جملة بجملة
2. ابحث عن أي وصف للعنف أو تهديد
3. إذا وجدت عنفاً، أخرج مخالفة

قاعدة: أي وصف لإيذاء جسدي أو تهديد = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 3: SEXUAL CONTENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSexualContentPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف محتوى جنسي.

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

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 4: DRUGS & ALCOHOL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDrugsPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف مخدرات وكحول.

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

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 5: DISCRIMINATION & INCITEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildDiscriminationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف تمييز وتحريض.

التمييز والتحريض الذي تبحث عنه:
تمييز عنصري، تمييز عرقي، تمييز لوني، عبد، رقيق، عبودية، تمييز جندري، تمييز ضد المرأة، تمييز ضد الرجل، احتقار المرأة، تحقير المرأة، تمييز ديني، تمييز طائفي، تمييز مذهبي، احتقار ديني، كفر، كافر (بمعنى مهين)، تمييز طبقي، تمييز اجتماعي، احتقار الفقراء، استعلاء طبقي، تحريض على العنف، تحريض على الكراهية، دعوة للقتل، دعوة للعنف، خطاب كراهية، كراهية عنصرية، كراهية دينية، تطرف، غلو، تشدد، تكفير، دعوة للفتنة، إثارة الفتنة، فتنة طائفية، تحريض طائفي

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي تمييز أو تحريض
2. ابحث عن احتقار، استعلاء، كراهية، دعوات للعنف
3. إذا وجدت تمييزاً أو تحريضاً، أخرج مخالفة

قاعدة: أي تمييز أو تحريض = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 6: NATIONAL SECURITY & GOVERNANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildNationalSecurityPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف محتوى يمس الأمن الوطني أو ثوابت الحكم.

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

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 7: EXTREMISM & BANNED GROUPS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildExtremismPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف تطرف وجماعات محظورة.

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

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 8: MISINFORMATION & CREDIBILITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildMisinformationPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف معلومات مضللة وشائعات.

المحتوى الذي تبحث عنه:
معلومات مضللة، معلومات غير دقيقة، معلومات مغلوطة، شائعات، أكاذيب، تقديم الرأي على أنه حقيقة، الخلط بين الرأي والمعلومة، التضليل التاريخي، تحريف التاريخ، التضليل الديني، تحريف الدين، التضليل السياسي، التضليل الاجتماعي، التضليل الاقتصادي، معلومات اقتصادية مضللة، إثارة الهلع الاقتصادي، زعزعة الثقة في المؤسسات، تشويه سمعة الشركات دون سند، تقديم وثائق مزيفة على أنها حقيقية، كشف معلومات سرية، كشف وثائق سرية، غياب التمييز بين الخيال والواقع

المواد:
${articlePayload}

مهمتك:
1. اقرأ النص بحثاً عن أي معلومات مضللة أو شائعات
2. ابحث عن تحريف، تضليل، أكاذيب، خلط بين الخيال والواقع
3. إذا وجدت معلومات مضللة، أخرج مخالفة

قاعدة: أي معلومات مضللة أو شائعات = مخالفة.

استثناء: عناوين المشاهد والمدد الزمنية فقط.

أرجع JSON: { "findings": [...] }`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PASS 9: INTERNATIONAL RELATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildInternationalPrompt(articles: GCAMArticle[]): string {
  const articlePayload = buildArticlePayload(articles);

  return `أنت كاشف محتوى يمس العلاقات الدولية.

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

أرجع JSON: { "findings": [...] }`;
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
  error?: string;
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
      return { passName: pass.name, findings: [], duration: 0 };
    }

    // Skip glossary pass if no lexicon terms
    if (pass.name === "glossary" && lexiconTerms.length === 0) {
      logger.info("Skipping glossary pass (no lexicon terms)");
      return { passName: pass.name, findings: [], duration: 0 };
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
    
    const duration = Date.now() - startTime;
    logger.info(`Pass ${pass.name} completed`, { 
      findingsCount: findings.length, 
      duration,
      model 
    });

    return { passName: pass.name, findings, duration };
    
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
    if (!existing || finding.confidence > existing.confidence) {
      seen.set(key, finding);
    }
  }
  
  return Array.from(seen.values());
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
  jobConfig: { temperature: number; seed: number }
): Promise<{
  findings: JudgeFinding[];
  passResults: PassResult[];
  totalDuration: number;
}> {
  const startTime = Date.now();
  
  logger.info("[DEBUG] runMultiPassDetection started", {
    chunkTextLength: chunkText.length,
    chunkStart,
    chunkEnd,
    allArticlesCount: allArticles.length,
    allArticleIds: allArticles.map(a => a.id),
    lexiconTermsCount: lexiconTerms.length,
    passCount: DETECTION_PASSES.length,
  });
  
  logger.info("Starting multi-pass detection", { 
    chunkStart, 
    chunkEnd, 
    passCount: DETECTION_PASSES.length,
    lexiconTermsCount: lexiconTerms.length 
  });

  // Run all passes in parallel
  const passResults = await Promise.all(
    DETECTION_PASSES.map(pass =>
      runSinglePass(chunkText, chunkStart, chunkEnd, pass, allArticles, lexiconTerms, jobConfig)
    )
  );

  // Collect all findings
  const allFindings = passResults.flatMap(r => r.findings);
  
  // Deduplicate
  const deduplicated = deduplicateFindings(allFindings);
  
  const totalDuration = Date.now() - startTime;
  
  logger.info("Multi-pass detection completed", {
    totalFindings: allFindings.length,
    afterDedup: deduplicated.length,
    dropped: allFindings.length - deduplicated.length,
    totalDuration,
    passResults: passResults.map(r => ({
      pass: r.passName,
      findings: r.findings.length,
      duration: r.duration
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
    totalDuration
  };
}
