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
    router: "v1.0",
    judge: "v1.0",
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
أرجع JSON فقط بالشكل: { "candidate_articles": [ { "article_id": عدد، "confidence": عدد بين 0 و 1 } ], "notes_ar": "اختياري" }.
لا تفسير ولا نص خارج JSON.`;

export const JUDGE_SYSTEM_MSG = `أنت محلل التزام بميثاق المحتوى (GCAM). مهمتك تحديد المخالفات في مقطع النص فقط.
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

export const REPAIR_SYSTEM_MSG = `You fix broken JSON. Return only valid JSON, no markdown, no explanation.
Expected shape: { "findings": [ { "article_id", "atom_id", "severity", "confidence", "title_ar", "description_ar", "evidence_snippet", "location": { "start_offset", "end_offset", "start_line", "end_line" }, "is_interpretive" } ] }`;
