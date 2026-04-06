import OpenAI from "openai";
import { config } from "./config.js";
import type { GCAMArticle } from "./gcam.js";
import {
  auditorAssessmentSchema,
  auditorOutputSchema,
  extractJsonFromText,
  judgeFindingSchema,
  judgeOutputSchema,
  parseAuditorOutput,
  parseJudgeOutput,
  parseRouterOutput,
  type AuditorAssessment,
  type AuditorOutput,
  type JudgeFinding,
  type JudgeOutput,
  type RouterOutput,
} from "./schemas.js";
import { logger } from "./logger.js";
import { AUDITOR_SYSTEM_MSG, RATIONALE_ONLY_SYSTEM_MSG, ROUTER_SYSTEM_MSG, JUDGE_SYSTEM_MSG } from "./aiConstants.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const REPAIR_SYSTEM = `You fix broken JSON. Return only valid JSON, no markdown, no explanation.
Expected shape: { "findings": [ { "article_id", "atom_id", "canonical_atom", "intensity", "context_impact", "legal_sensitivity", "audience_risk", "confidence", "title_ar", "description_ar", "evidence_snippet", "location": { "start_offset", "end_offset", "start_line", "end_line" }, "is_interpretive" } ] }
Each of intensity, context_impact, legal_sensitivity, audience_risk must be 1-4. Do NOT include "severity" (computed by backend).`;

type OpenAiCallOptions = {
  signal?: AbortSignal;
};

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
  jobConfig: { router_model: string; temperature: number; seed: number; max_router_candidates: number },
  routerSystemPrompt?: string,
  options: OpenAiCallOptions = {}
): Promise<RouterOutput> {
  const payload = buildRouterArticlesPayload(articleList);
  const textSlice = chunkText.slice(0, 15_000);
  const userContent = `${payload}\n\n---\nمقطع النص:\n${textSlice}\n\nأرجع JSON بقائمة candidate_articles فقط.`;

  const resp = await openai.chat.completions.create({
    model: jobConfig.router_model,
    messages: [
      { role: "system", content: routerSystemPrompt || ROUTER_SYSTEM_MSG },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: jobConfig.temperature,
    seed: jobConfig.seed,
  }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });

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
  jobConfig: { judge_model: string; temperature: number; seed: number },
  judgeSystemPrompt?: string,
  userPromptAddition?: string | null,
  options: OpenAiCallOptions = {}
): Promise<string> {
  const payload = buildJudgeArticlesPayload(selectedArticles);
  const textSlice = chunkText.slice(0, 30_000);
  const allowedArticleIds = selectedArticles.map((a) => a.id).join(", ");
  const userContent = `${payload}\n\n---\nمقطع النص (start_offset=${globalStart}، end_offset=${globalEnd}):\n${textSlice}\n\nقواعد تنسيق إلزامية:\n- article_id (اختياري): إذا استخدمته فيجب أن يكون رقماً صحيحاً من المواد المعروضة فقط: [${allowedArticleIds}]. إذا لم تُحدده استخدم canonical_atom.\n- canonical_atom مطلوب: واحدة من INSULT, VIOLENCE, SEXUAL, SUBSTANCES, DISCRIMINATION, CHILD_SAFETY, WOMEN, MISINFORMATION, PUBLIC_ORDER, EXTREMISM, INTERNATIONAL, ECONOMIC, PRIVACY, APPEARANCE.\n- intensity, context_impact, legal_sensitivity, audience_risk مطلوبة وكل واحدة رقماً بين 1 و 4.\n- rationale_ar مطلوبة: جملة أو جملتان بالعربية تشرح أين يظهر المقتطف، ما الذي تم رصده، ولماذا يندرج تحت المادة. امنع الشرح العام مثل "وجود لفظ مخالف" دون توضيح.\n- يجب أن يطابق rationale_ar المادة الأساسية المختارة، ولا تذكر مادة مختلفة عنها في الشرح.\n- لا تُرجع severity — تُحسب في الخلفية.\n- evidence_snippet يجب أن يكون أصغر اقتباس حرفي ممكن يثبت المخالفة، وليس فقرة واسعة إلا إذا تعذر غير ذلك.\n- location.start_offset و location.end_offset يجب أن يحددا نفس المقتطف القصير داخل chunk الحالي (لا تُرجع null ولا نافذة واسعة بلا حاجة).\n- confidence رقماً بين 0 و 1.\n- evidence_snippet نصاً غير null.\n${userPromptAddition && userPromptAddition.trim().length > 0 ? `\n${userPromptAddition.trim()}\n` : ""}أرجع JSON بمصفوفة findings فقط.`;

  const resp = await openai.chat.completions.create({
    model: jobConfig.judge_model,
    messages: [
      { role: "system", content: judgeSystemPrompt || JUDGE_SYSTEM_MSG },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: jobConfig.temperature,
    seed: jobConfig.seed,
  }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });

  return resp.choices[0]?.message?.content ?? '{"findings":[]}';
}

/**
 * Repair broken JSON then re-parse/validate. Used when parse or zod fails.
 */
export async function callRepairJson(
  model: string,
  brokenContent: string,
  context: string,
  options: OpenAiCallOptions = {}
): Promise<string> {
  const slice = brokenContent.slice(0, 8000);
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: REPAIR_SYSTEM },
      { role: "user", content: `Context: ${context}\n\nBroken JSON:\n${slice}\n\nReturn the corrected JSON only.` },
    ],
    response_format: { type: "json_object" },
  }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });
  return resp.choices[0]?.message?.content ?? "{}";
}

/**
 * Parse judge output with repair loop: if JSON parse or zod fails, call repair and retry once.
 */
export async function parseJudgeWithRepair(
  raw: string,
  model: string,
  options: OpenAiCallOptions = {}
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

      // Salvage valid findings instead of dropping entire pass when some items are malformed.
      try {
        const json = extractJsonFromText(content);
        const parsed = JSON.parse(json) as any;
        const rawFindings: any[] = Array.isArray(parsed?.findings) ? parsed.findings : [];
        if (rawFindings.length > 0) {
          const salvaged: JudgeFinding[] = [];
          let dropped = 0;
          for (const rf of rawFindings) {
            const normalized = { ...(rf ?? {}) } as Record<string, unknown>;
            // Derive article_id from atom_id if model omitted article_id (e.g. "5-2").
            if (
              (normalized.article_id == null || normalized.article_id === "") &&
              typeof normalized.atom_id === "string"
            ) {
              const m = normalized.atom_id.match(/^(\d+)[-.]/);
              if (m) normalized.article_id = Number(m[1]);
            }
            const one = judgeFindingSchema.safeParse(normalized);
            if (one.success) salvaged.push(one.data);
            else dropped++;
          }
          if (salvaged.length > 0) {
            logger.warn("Judge partial salvage applied", {
              attempt,
              rawCount: rawFindings.length,
              salvaged: salvaged.length,
              dropped,
            });
            return { findings: salvaged };
          }
        }
      } catch {
        // ignore salvage errors; continue to repair path
      }

      content = await callRepairJson(model, content, "Judge findings JSON", options);
    }
  }
  return { findings: [] };
}

export async function callAuditorRaw(
  canonicalPayload: string,
  fullText: string,
  model: string,
  auditorSystemPrompt?: string,
  auditorContext?: string | null,
  options: OpenAiCallOptions = {}
): Promise<string> {
  const clippedPayload = canonicalPayload.slice(0, 45_000);
  const clippedText = fullText.slice(0, 35_000);
  const clippedAuditorContext =
    typeof auditorContext === "string" && auditorContext.trim().length > 0
      ? auditorContext.trim().slice(0, 12_000)
      : null;
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: auditorSystemPrompt || AUDITOR_SYSTEM_MSG },
      {
        role: "user",
        content: `المرشحات القانونية canonical:\n${clippedPayload}\n\n${
          clippedAuditorContext
            ? `سياق إضافي للمراجع (Pipeline V2):\n${clippedAuditorContext}\n\n`
            : ""
        }مقتطف النص الكامل:\n${clippedText}\n\nأرجع JSON فقط. كل assessment يجب أن يحتوي حقل rationale_ar مملوءاً (جملة أو جملتان بالعربية: أين في النص، ماذا يعني في السياق، ولماذا اعتُبرت مخالفة أو تحتاج مراجعة). إذا وُجد سياق إضافي للمراجع فاستخدمه فقط لفهم الحبكة، نبرة المشهد، وموقف السرد؛ ولا تعتمد عليه كدليل حرفي ما لم يكن النص الحرفي موجوداً أيضاً في المقتطف الحالي. مثال: "المقتطف من مشهد حلم يصف ضحية طعن؛ السياق درامي ولا يروّج للعنف لكن الوصف يتجاوز ضوابط مادة 9."`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 8192,
    temperature: 0,
    seed: 12345,
  }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });
  return resp.choices[0]?.message?.content ?? '{"assessments":[]}';
}

export type RationaleOnlyItem = {
  canonical_finding_id: string;
  evidence_snippet: string;
  final_ruling: string;
  primary_article_id: number;
  title_ar?: string;
  weak_rationale?: string | null;
};

export type RationaleOnlyResult = {
  canonical_finding_id: string;
  rationale_ar: string;
};

/**
 * Second pass: generate only rationale_ar for findings that have default/empty rationale.
 * Single focused task so the model reliably fills the field.
 */
export async function callRationaleOnly(
  items: RationaleOnlyItem[],
  model: string,
  options: OpenAiCallOptions = {}
): Promise<RationaleOnlyResult[]> {
  if (items.length === 0) return [];
  const payload = items
    .map(
      (r, i) =>
        `${i + 1}. canonical_finding_id: ${r.canonical_finding_id}\n   title_ar: "${(r.title_ar || "").slice(0, 200)}"\n   evidence_snippet: "${(r.evidence_snippet || "").slice(0, 500)}"\n   final_ruling: ${r.final_ruling}\n   primary_article_id: ${r.primary_article_id}\n   weak_rationale: "${(r.weak_rationale || "").slice(0, 300)}"`
    )
    .join("\n\n");
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: RATIONALE_ONLY_SYSTEM_MSG },
      { role: "user", content: `اكتب rationale_ar لكل عنصر بالعربية (جملة أو جملتان). أرجع JSON فقط: {"rationales":[{"canonical_finding_id":"...","rationale_ar":"..."}]}\n\nالعناصر:\n\n${payload}` },
    ],
    response_format: { type: "json_object" },
    max_tokens: 3072,
    temperature: 0,
    seed: 12345,
  }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  try {
    const json = extractJsonFromText(raw);
    const parsed = JSON.parse(json) as {
      rationales?: Array<{ canonical_finding_id?: string; rationale_ar?: string; rationale?: string }>;
      items?: Array<{ canonical_finding_id?: string; rationale_ar?: string; rationale?: string }>;
    };
    const list = Array.isArray(parsed.rationales)
      ? parsed.rationales
      : Array.isArray(parsed.items)
        ? parsed.items
        : [];
    return list
      .filter((r) => r?.canonical_finding_id)
      .map((r) => {
        const text = (r.rationale_ar ?? r.rationale ?? "").trim();
        return text !== "" ? { canonical_finding_id: String(r.canonical_finding_id), rationale_ar: text } : null;
      })
      .filter((x): x is RationaleOnlyResult => x != null);
  } catch (e) {
    logger.warn("Rationale-only parse failed", { rawSlice: raw.slice(0, 400), error: String(e) });
    return [];
  }
}

export async function parseAuditorWithRepair(
  raw: string,
  model: string,
  options: OpenAiCallOptions = {}
): Promise<AuditorOutput> {
  let content = raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseAuditorOutput(content);
    } catch (e) {
      logger.warn("Auditor parse/validation failed, attempting repair", { attempt, error: String(e) });
      try {
        const json = extractJsonFromText(content);
        const parsed = JSON.parse(json) as { assessments?: Array<Record<string, unknown>> };
        const rows = Array.isArray(parsed.assessments) ? parsed.assessments : [];
        for (const row of rows) {
          if ((row.rationale_ar == null || String(row.rationale_ar).trim() === "") && typeof row.rationale === "string" && row.rationale.trim() !== "") {
            row.rationale_ar = row.rationale;
          }
        }
        if (rows.length > 0) {
          const salvaged: AuditorAssessment[] = [];
          for (const row of rows) {
            const one = auditorAssessmentSchema.safeParse(row);
            if (one.success) salvaged.push(one.data);
          }
          if (salvaged.length > 0) return { assessments: salvaged };
        }
      } catch {
        // ignore and try repair
      }
      content = await callRepairJson(model, content, "Auditor assessments JSON", options);
    }
  }
  return { assessments: [] };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REVISIT PASS (Option B: separate light pass — words/sentences to revisit)
// Does not affect violations or ملاحظات. Output goes only to report section "كلمات/عبارات للمراجعة".
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RevisitMention = {
  term: string;
  snippet: string;
  start_offset: number;
  end_offset: number;
};

const REVISIT_SPOTTER_SYSTEM = `أنت مكتشف كلمات وعبارات فقط. مهمتك: ابحث في النص عن كل ظهور للكلمات/العبارات المعطاة في القائمة.
لا تحكم على المحتوى (لا تقل مخالفة أو لا). فقط سجّل كل موضع تظهر فيه إحدى الكلمات أو العبارات.
أرجع JSON فقط بالشكل: { "mentions": [ { "term": "الكلمة أو العبارة كما في القائمة", "snippet": "مقتطف قصير من النص حول الموضع (حد أقصى 100 حرف)", "start_offset": رقم_بداية_الحرف, "end_offset": رقم_نهاية_الحرف } ] }
استخدم أرقام الموضع (offset) من بداية النص (أول حرف = 0).`;

/** Runs a single lightweight LLM pass to list every occurrence of given terms in the text. Used only for "words to revisit" report section. */
export async function callRevisitSpotter(
  textSlice: string,
  terms: string[],
  model: string = "gpt-4.1-mini",
  options: OpenAiCallOptions = {}
): Promise<RevisitMention[]> {
  if (!config.OPENAI_API_KEY || terms.length === 0 || !textSlice.trim()) return [];
  const termsList = terms.slice(0, 80).map((t) => `"${t}"`).join("، ");
  const userContent = `القائمة: ${termsList}\n\n---\nالنص:\n${textSlice.slice(0, 28_000)}\n\nأرجع JSON فقط: { "mentions": [ ... ] }`;

  try {
    const resp = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: REVISIT_SPOTTER_SYSTEM },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2048,
      temperature: 0,
    }, { timeout: config.JUDGE_TIMEOUT_MS, signal: options.signal });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { mentions?: Array<{ term?: string; snippet?: string; start_offset?: number; end_offset?: number }> };
    const list = Array.isArray(parsed.mentions) ? parsed.mentions : [];
    return list
      .filter((m) => m?.term != null && String(m.term).trim() !== "")
      .map((m) => ({
        term: String(m.term).trim(),
        snippet: String(m.snippet ?? "").trim().slice(0, 200),
        start_offset: Number(m.start_offset) >= 0 ? Number(m.start_offset) : 0,
        end_offset: Number(m.end_offset) > 0 ? Number(m.end_offset) : Number(m.start_offset) + 1,
      }));
  } catch (e) {
    logger.warn("Revisit spotter pass failed", { error: String(e), termsCount: terms.length });
    return [];
  }
}
