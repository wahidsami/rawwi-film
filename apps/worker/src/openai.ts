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
import { ROUTER_SYSTEM_MSG, JUDGE_SYSTEM_MSG } from "./aiConstants.js";

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
  const userContent = `${payload}\n\n---\nمقطع النص (start_offset=${globalStart}، end_offset=${globalEnd}):\n${textSlice}\n\nقاعدة تنسيق إلزامية: location.start_offset و location.end_offset يجب أن يكونا أرقاماً (لا تُرجع null).\nأرجع JSON بمصفوفة findings فقط.`;

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
      content = await callRepairJson(model, content, "Judge findings JSON");
    }
  }
  return { findings: [] };
}
