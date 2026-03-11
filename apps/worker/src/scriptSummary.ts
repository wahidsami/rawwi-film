import OpenAI from "openai";
import { config } from "./config.js";
import { logger } from "./logger.js";

export type ScriptSummaryPayload = {
  synopsis_ar: string;
  key_risky_events_ar?: string;
  narrative_stance_ar?: string;
  compliance_posture_ar?: string;
  confidence: number;
};

const SYSTEM_MSG = `أنت مدقق محتوى. مهمتك فهم النص كقصة: أحداث، حوارات، أوصاف، وموقف السرد.
أرجع JSON فقط بالشكل:
{
  "synopsis_ar": "ملخص موجز للحبكة والشخصيات والمسار العام (2-4 جمل)",
  "key_risky_events_ar": "أهم المشاهد أو الأحداث التي قد تثير مخاوف امتثال (إن وُجدت)، بشكل مختصر",
  "narrative_stance_ar": "موقف السرد من السلوكيات الحساسة: إدانة، تطبيع، أو محايد",
  "compliance_posture_ar": "انطباع عام عن مدى توافق النص مع ضوابط المحتوى",
  "confidence": عدد بين 0 و 1
}
لا تفسير خارج JSON.`;

export async function generateScriptSummary(
  fullText: string,
  scriptTitle?: string
): Promise<ScriptSummaryPayload | null> {
  if (!config.OPENAI_API_KEY || !fullText?.trim()) return null;
  const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const clip = fullText.slice(0, 28000);
  const userContent = scriptTitle
    ? `العنوان: ${scriptTitle}\n\nالنص:\n${clip}`
    : `النص:\n${clip}`;

  try {
    const resp = await openai.chat.completions.create({
      model: config.OPENAI_JUDGE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_MSG },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1024,
      temperature: 0.3,
    });
    const raw = resp.choices[0]?.message?.content ?? "{}";
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    const json = first >= 0 && last > first ? raw.slice(first, last + 1) : raw;
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.7;
    return {
      synopsis_ar: typeof parsed.synopsis_ar === "string" ? parsed.synopsis_ar : "—",
      key_risky_events_ar: typeof parsed.key_risky_events_ar === "string" ? parsed.key_risky_events_ar : undefined,
      narrative_stance_ar: typeof parsed.narrative_stance_ar === "string" ? parsed.narrative_stance_ar : undefined,
      compliance_posture_ar: typeof parsed.compliance_posture_ar === "string" ? parsed.compliance_posture_ar : undefined,
      confidence,
    };
  } catch (e) {
    logger.warn("Script summary generation failed", { error: String(e) });
    return null;
  }
}
