import OpenAI from "openai";
import { config } from "./config.js";
import type { GCAMArticle } from "./gcam.js";
import {
  extractJsonFromText,
  judgeOutputSchema,
  parseJudgeOutput,
  parseRouterOutput,
  type JudgeFinding,
  type JudgeOutput,
  type RouterOutput,
} from "./schemas.js";
import { logger } from "./logger.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const ROUTER_SYSTEM_AR = `أنت مرشّح فقط: مهمتك اختيار المواد الأكثر صلة بمقطع النص من قائمة المواد المعطاة.
قاعدة إلزامية: إذا احتوى النص على سبّ، شتم، إهانة، إساءة قائمة على الجنس، عدائية لفظية أو تهديد، يجب إضافة المواد [4، 5، 7، 17] إلى المرشحين.
أرجع JSON فقط بالشكل: { "candidate_articles": [ { "article_id": عدد، "confidence": عدد بين 0 و 1 } ], "notes_ar": "اختياري" }.
لا تفسير ولا نص خارج JSON.`;

const JUDGE_SYSTEM_AR = `أنت محلل التزام بميثاق المحتوى (GCAM). مهمتك تحديد المخالفات في مقطع النص فقط.
المرحلة 1 — فحص معجمي صارم: وجود سبّ، شتم، إهانة، لغة غير لائقة، إساءة جندرية، إيحاءات جسدية/جنسية، عنف لفظي أو تهديد = لا يجوز إرجاع findings فارغة؛ يجب ربط كل مخالفة بالمادة المناسبة (مثلاً 4، 5، 7، 17، 9، 23، 24).
المرحلة 2 — مخالفات صريحة: عنف، تمييز، محتوى جنسي، مخدرات/كحول، كرامة، تحريض، إلخ.
المرحلة 3 — إشارات تفسيرية (ناعمة): إن لم توجد مخالفة صريحة، يمكنك إخراج إشارة تفسيرية بشدة منخفضة مع is_interpretive: true ودليل واضح.
ممنوع: اقتراحات ("ينبغي")، معايير خارج GCAM.
قاعدة atom_id: استخدم فقط القيم المدرجة تحت كل مادة (صيغة رقم-رقم مثل 4-1، 5-2). لا تخترع قيماً غير مذكورة؛ إن لم تنطبق أي قاعدة فرعية اترك atom_id فارغاً أو null.
الدليل: كل finding يجب أن يحتوي evidence_snippet (اقتباس حرفي من النص). إن لم تستطع اقتباس حرفيًا فلا تخرج المخالفة.
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

const REPAIR_SYSTEM = `You fix broken JSON. Return only valid JSON, no markdown, no explanation.
Expected shape: { "findings": [ { "article_id", "atom_id", "severity", "confidence", "title_ar", "description_ar", "evidence_snippet", "location": { "start_offset", "end_offset", "start_line", "end_line" }, "is_interpretive" } ] }`;

// v1.1: Precision-first prompt with false positive reduction
const JUDGE_SYSTEM_V1_1 = `أنت محلل التزام بميثاق المحتوى (GCAM). مهمتك تحديد المخالفات في مقطع النص فقط.

قاعدة الدقة الأولى: أخرج مخالفة فقط إذا كان الدليل صريحاً ومنتهكاً بصورة لا لبس فيها للمادة.
إن كانت العبارة محايدة أو تقنية (وصف مشهد، مدة، إشارات مسرحية، عناوين، بيانات وصفية)، فلا تُخرِج مخالفة.
الشك = لا مخالفة. المحايد = لا مخالفة. الوصفي البحت = لا مخالفة.

ممنوع اعتبارها مخالفات (عناصر تقنية محايدة):
- عناوين المشاهد أو الفصول
- مدد زمنية (مثل "20 دقيقة"، "المستهدفة: حوالي ساعة")
- إشارات مسرحية (مثل "ستارة موجودة"، "مؤثرات صوتية: رعد")
- بيانات وصفية تقنية (جودة الصورة، تحرير، إلخ.)
- أوصاف محايدة للمكان أو الأشخاص بدون محتوى مُنتهِك

إضافات منع الالتباس (أيضاً ليست مخالفات):
- تصنيفات عمرية/تحذيرات/ملصقات/ميتا مثل: R18، "تحذير:", "تنبيه:", "التصنيف:", "النوع:", "المدة:", "المستهدفة:"
- رؤوس أقسام إنتاجية/تنسيقية مثل: INT/EXT، "المشهد"، "لقطة"، "داخلي/خارجي"، "صوت/مؤثرات"، "مونتاج/قطع"
- أسماء ملفات/أكواد/مراجع أو تنسيقات أو عناوين تقرير
- أي نص “إرشادي” أو “وصف تقني” لا يحمل فعل/إهانة/تهديد/محتوى منتهك داخل القصة

المرحلة 1 — فحص معجمي صارم: وجود سبّ، شتم، إهانة، لغة غير لائقة، إساءة جندرية، إيحاءات جسدية/جنسية، عنف لفظي أو تهديد = أخرج مخالفة إن كانت موجودة صريحة؛ إن كان النص نظيفاً، أرجع findings فارغة.
المرحلة 2 — مخالفات صريحة: عنف، تمييز، محتوى جنسي، مخدرات/كحول، كرامة، تحريض، إلخ.

المرحلة 3 — إشارات تفسيرية (ناعمة): إن لم توجد مخالفة صريحة ولكن هناك احتمال ضعيف، يمكنك إخراج إشارة تفسيرية بشدة منخفضة مع is_interpretive: true، confidence < 0.7، ودليل واضح.
ملاحظة تشغيلية: إذا كان “الاحتمال الضعيف” ناتجاً عن metadata/عنوان/مدة/تحذير/تنسيق (مثل "20 دقيقة" أو "R18" أو "تحذير") فلا تُخرج أي finding إطلاقاً.

إشارة ناعمة (soft signal): عبارة قد تحتاج مراجعة بشرية لكن ليست مخالفة قطعية. مثال: لغة مبهمة، سياق غامض.
شروط إشارة ناعمة: is_interpretive: true، severity: low أو medium فقط، confidence < 0.7، وصف واضح يبرر عدم اليقين.
قيود الإشارة الناعمة: لا تُستخدم الإشارة الناعمة مع عناصر تقنية محايدة أو metadata أو عناوين أو مدد أو إشارات مسرحية.

ممنوع: اقتراحات ("ينبغي")، معايير خارج GCAM.

قاعدة atom_id: استخدم فقط القيم المدرجة تحت كل مادة (صيغة رقم-رقم مثل 4-1، 5-2). لا تخترع قيماً غير مذكورة؛ إن لم تنطبق أي قاعدة فرعية اترك atom_id فارغاً أو null.

قاعدة الدليل (evidence) — إلزامية:
- كل finding يجب أن يحتوي evidence_snippet (اقتباس حرفي من النص). إن لم تستطع اقتباس حرفيًا فلا تخرج المخالفة.
- قاعدة الدليل غير-الوصفي: لا تقبل كـ evidence_snippet أي نص قصير من نوع metadata/عنوان/مدة/تحذير حتى لو احتوى كلمة حساسة. يجب أن يكون الدليل جزءًا من حوار أو فعل داخل القصة وليس وسمًا أو عنوانًا.
- قاعدة الجملة الكاملة: إذا كان الدليل أقل من 12 حرفًا أو عبارة قصيرة جدًا (مثل "20 دقيقة") فاعتبره غير كافٍ ولا تُخرج finding. حاول اقتباس جملة كاملة أو سطر حوار كامل يوضح الانتهاك بوضوح.
- قاعدة الوصف المحايد: أوصاف مثل “طفل جالس على الأرض” أو “ستارة موجودة” أو “المدة المستهدفة” ليست مخالفة ولا تُصنَّف تحت أي مادة.

تعليمات السياق: عند تحليل أي عبارة، راجع ±100 حرفاً حولها قبل تصنيفها.
العبارة المعزولة قد تبدو مشبوهة، لكن السياق قد يكشف أنها جزء من وصف تقني محايد.
مثال: "عنف شديد" معزولة = مخالفة محتملة؛ "يحظر: عنف شديد" في سياق قاعدة = ليست مخالفة.

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


function buildRouterArticlesPayload(articleList: GCAMArticle[]): string {
  return articleList.map((a) => `المادة ${a.id}: ${a.title_ar}`).join("\n");
}

function buildJudgeArticlesPayload(articles: GCAMArticle[]): string {
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

/**
 * Router: select up to K relevant articles; output JSON only.
 * Sorts candidates by confidence (desc) then ID (asc) to ensure determinism.
 */
export async function callRouter(
  chunkText: string,
  articleList: GCAMArticle[],
  jobConfig: { router_model: string; temperature: number; seed: number; max_router_candidates: number }
): Promise<RouterOutput> {
  const payload = buildRouterArticlesPayload(articleList);
  const textSlice = chunkText.slice(0, 15_000);
  const userContent = `${payload}\n\n---\nمقطع النص:\n${textSlice}\n\nأرجع JSON بقائمة candidate_articles فقط.`;

  const resp = await openai.chat.completions.create({
    model: jobConfig.router_model,
    messages: [
      { role: "system", content: ROUTER_SYSTEM_AR },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: jobConfig.temperature,
    seed: jobConfig.seed,
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const parsed = parseRouterOutput(raw);

  // Enforce deterministic sorting: valid candidates, sort by confidence desc, then ID asc
  const candidates = (parsed.candidate_articles || [])
    .filter(c => c.article_id != null)
    .sort((a, b) => {
      const confDiff = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (Math.abs(confDiff) > 0.0001) return confDiff;
      return (a.article_id ?? 0) - (b.article_id ?? 0);
    });

  // Slice to fixed count
  const k = jobConfig.max_router_candidates || 8;
  return {
    ...parsed,
    candidate_articles: candidates.slice(0, k)
  };
}

/**
 * Judge: return raw API response (so pipeline can run repair on parse failure).
 */
export async function callJudgeRaw(
  chunkText: string,
  selectedArticles: GCAMArticle[],
  globalStart: number,
  globalEnd: number,
  jobConfig: { judge_model: string; temperature: number; seed: number }
): Promise<string> {
  const payload = buildJudgeArticlesPayload(selectedArticles);
  const textSlice = chunkText.slice(0, 30_000);
  const userContent = `${payload}\n\n---\nمقطع النص (start_offset=${globalStart}، end_offset=${globalEnd}):\n${textSlice}\n\nأرجع JSON بمصفوفة findings فقط.`;

  const resp = await openai.chat.completions.create({
    model: jobConfig.judge_model,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_V1_1 }, // Using v1.1 precision prompt
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: jobConfig.temperature,
    seed: jobConfig.seed,
  }, { timeout: config.JUDGE_TIMEOUT_MS });

  return resp.choices[0]?.message?.content ?? '{"findings":[]}';
}

/**
 * Repair broken JSON then re-parse/validate. Used when parse or zod fails.
 */
export async function callRepairJson(
  model: string,
  brokenContent: string,
  context: string
): Promise<string> {
  const slice = brokenContent.slice(0, 8000);
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: REPAIR_SYSTEM },
      { role: "user", content: `Context: ${context}\n\nBroken JSON:\n${slice}\n\nReturn the corrected JSON only.` },
    ],
    response_format: { type: "json_object" },
  });
  return resp.choices[0]?.message?.content ?? "{}";
}

/**
 * Parse judge output with repair loop: if JSON parse or zod fails, call repair and retry once.
 */
export async function parseJudgeWithRepair(
  raw: string,
  model: string
): Promise<{ findings: JudgeFinding[] }> {
  let content = raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const json = extractJsonFromText(content);
      const parsed = JSON.parse(json) as unknown;
      const out = judgeOutputSchema.parse(parsed);
      return { findings: out.findings };
    } catch (e) {
      logger.warn("Judge parse/validation failed, attempting repair", { attempt, error: String(e) });
      content = await callRepairJson(model, content, "Judge findings JSON");
    }
  }
  return { findings: [] };
}
