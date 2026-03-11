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
import { AUDITOR_SYSTEM_MSG, ROUTER_SYSTEM_MSG, JUDGE_SYSTEM_MSG } from "./aiConstants.js";

const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const REPAIR_SYSTEM = `You fix broken JSON. Return only valid JSON, no markdown, no explanation.
Expected shape: { "findings": [ { "article_id", "atom_id", "severity", "confidence", "title_ar", "description_ar", "evidence_snippet", "location": { "start_offset", "end_offset", "start_line", "end_line" }, "is_interpretive" } ] }`;

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
  routerSystemPrompt?: string
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
  jobConfig: { judge_model: string; temperature: number; seed: number },
  judgeSystemPrompt?: string
): Promise<string> {
  const payload = buildJudgeArticlesPayload(selectedArticles);
  const textSlice = chunkText.slice(0, 30_000);
  const userContent = `${payload}\n\n---\nمقطع النص (start_offset=${globalStart}، end_offset=${globalEnd}):\n${textSlice}\n\nقواعد تنسيق إلزامية:\n- article_id مطلوب ويجب أن يكون رقماً صحيحاً بين 1 و 25.\n- location.start_offset و location.end_offset يجب أن يكونا أرقاماً (لا تُرجع null).\n- severity يجب أن تكون إحدى القيم: low | medium | high | critical.\n- confidence يجب أن تكون رقماً بين 0 و 1.\n- evidence_snippet يجب أن تكون نصاً غير null.\nأرجع JSON بمصفوفة findings فقط.`;

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

      content = await callRepairJson(model, content, "Judge findings JSON");
    }
  }
  return { findings: [] };
}

export async function callAuditorRaw(
  canonicalPayload: string,
  fullText: string,
  model: string,
  auditorSystemPrompt?: string
): Promise<string> {
  const clippedPayload = canonicalPayload.slice(0, 45_000);
  const clippedText = fullText.slice(0, 35_000);
  const resp = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: auditorSystemPrompt || AUDITOR_SYSTEM_MSG },
      {
        role: "user",
        content: `المرشحات القانونية canonical:\n${clippedPayload}\n\nمقتطف النص الكامل:\n${clippedText}\n\nأرجع JSON فقط. يجب أن يحتوي كل assessment على rationale_ar (جملة أو جملتان بالعربية تشرح: أين يظهر المقتطف في النص، ماذا يعني في السياق، ولماذا اعتُبرت مخالفة أو تحتاج مراجعة).`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: 0,
    seed: 12345,
  }, { timeout: config.JUDGE_TIMEOUT_MS });
  return resp.choices[0]?.message?.content ?? '{"assessments":[]}';
}

export async function parseAuditorWithRepair(
  raw: string,
  model: string
): Promise<AuditorOutput> {
  let content = raw;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parseAuditorOutput(content);
    } catch (e) {
      logger.warn("Auditor parse/validation failed, attempting repair", { attempt, error: String(e) });
      try {
        const json = extractJsonFromText(content);
        const parsed = JSON.parse(json) as { assessments?: unknown[] };
        const rows = Array.isArray(parsed.assessments) ? parsed.assessments : [];
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
      content = await callRepairJson(model, content, "Auditor assessments JSON");
    }
  }
  return { assessments: [] };
}
