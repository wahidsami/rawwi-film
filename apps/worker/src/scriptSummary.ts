import OpenAI from "openai";
import { randomUUID } from "crypto";
import { canonicalStringify } from "./canonicalJson.js";
import { config } from "./config.js";
import { supabase } from "./db.js";
import { sha256 } from "./hash.js";
import { logger } from "./logger.js";

export const SCRIPT_SUMMARY_VERSION = "script-summary-v1";

export type ScriptSummaryPayload = {
  synopsis_ar: string;
  main_characters_ar?: string;
  relationship_map_ar?: string;
  key_risky_events_ar?: string;
  narrative_stance_ar?: string;
  compliance_posture_ar?: string;
  confidence: number;
};

export type ScriptSummarySource = "cache" | "generated" | "unavailable";

export type ResolvedScriptSummary = {
  summary: ScriptSummaryPayload | null;
  summaryHash: string | null;
  summarySource: ScriptSummarySource;
  summaryGenerationDurationMs: number | null;
  summaryGenerationTimestamp: string | null;
  summaryModel: string | null;
  summaryVersion: string | null;
};

type StoredSummaryRow = {
  summary_json?: unknown;
  summary_hash?: string | null;
  summary_generation_timestamp?: string | null;
  summary_model?: string | null;
  summary_version?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeScriptSummaryPayload(candidate: unknown): ScriptSummaryPayload | null {
  if (!isRecord(candidate)) return null;

  const confidence = typeof candidate.confidence === "number"
    ? Math.max(0, Math.min(1, candidate.confidence))
    : 0.7;

  return {
    synopsis_ar: typeof candidate.synopsis_ar === "string" ? candidate.synopsis_ar : "—",
    main_characters_ar: typeof candidate.main_characters_ar === "string" ? candidate.main_characters_ar : undefined,
    relationship_map_ar: typeof candidate.relationship_map_ar === "string" ? candidate.relationship_map_ar : undefined,
    key_risky_events_ar: typeof candidate.key_risky_events_ar === "string" ? candidate.key_risky_events_ar : undefined,
    narrative_stance_ar: typeof candidate.narrative_stance_ar === "string" ? candidate.narrative_stance_ar : undefined,
    compliance_posture_ar: typeof candidate.compliance_posture_ar === "string" ? candidate.compliance_posture_ar : undefined,
    confidence,
  };
}

function extractSummaryCandidate(payload: unknown): unknown {
  if (!isRecord(payload)) return null;
  if ("synopsis_ar" in payload) return payload;
  if (isRecord(payload.summary)) return payload.summary;
  if (isRecord(payload.summary_json)) return payload.summary_json;
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeScriptSummaryHash(summary: ScriptSummaryPayload): string {
  return sha256(canonicalStringify(summary));
}

async function loadPersistedScriptSummary(scriptId: string, versionId: string): Promise<ResolvedScriptSummary | null> {
  try {
    const { data, error } = await supabase
      .from("analysis_script_summaries")
      .select("summary_json, summary_hash, summary_generation_timestamp, summary_model, summary_version")
      .eq("script_id", scriptId)
      .eq("version_id", versionId)
      .maybeSingle();

    if (error) {
      logger.warn("Persisted script summary lookup failed", {
        scriptId,
        versionId,
        error: error.message,
      });
      return null;
    }

    const row = (data ?? null) as StoredSummaryRow | null;
    const summary = normalizeScriptSummaryPayload(row?.summary_json);
    if (!summary) return null;

    const summaryHash = computeScriptSummaryHash(summary);
    const storedHash = typeof row?.summary_hash === "string" && row.summary_hash.length > 0 ? row.summary_hash : null;
    if (storedHash && storedHash !== summaryHash) {
      logger.warn("Persisted script summary hash mismatch", {
        scriptId,
        versionId,
        storedHash,
        computedHash: summaryHash,
      });
      return null;
    }

    return {
      summary,
      summaryHash: storedHash ?? summaryHash,
      summarySource: "cache",
      summaryGenerationDurationMs: 0,
      summaryGenerationTimestamp: typeof row?.summary_generation_timestamp === "string" ? row.summary_generation_timestamp : null,
      summaryModel: typeof row?.summary_model === "string" ? row.summary_model : null,
      summaryVersion: typeof row?.summary_version === "string" ? row.summary_version : SCRIPT_SUMMARY_VERSION,
    };
  } catch (error) {
    logger.warn("Persisted script summary read threw", {
      scriptId,
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function loadLegacyScriptSummary(scriptId: string, versionId: string): Promise<ResolvedScriptSummary | null> {
  try {
    const { data, error } = await supabase
      .from("analysis_memory_units")
      .select("payload, created_at")
      .eq("script_id", scriptId)
      .eq("version_id", versionId)
      .eq("scope_level", "script")
      .eq("unit_type", "script_memory_summary")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(20);

    if (error) {
      logger.warn("Legacy script summary lookup failed", {
        scriptId,
        versionId,
        error: error.message,
      });
      return null;
    }

    const rows = (data ?? []) as Array<{ payload?: unknown; created_at?: string | null }>;
    for (const row of rows) {
      const summary = normalizeScriptSummaryPayload(extractSummaryCandidate(row.payload));
      if (!summary) continue;

      const payloadRecord = isRecord(row.payload) ? row.payload : {};
      const summaryHash =
        typeof payloadRecord.summaryHash === "string" && payloadRecord.summaryHash.length > 0
          ? payloadRecord.summaryHash
          : typeof payloadRecord.summary_hash === "string" && payloadRecord.summary_hash.length > 0
            ? payloadRecord.summary_hash
          : computeScriptSummaryHash(summary);
      const summaryGenerationTimestamp =
        typeof payloadRecord.summaryGenerationTimestamp === "string"
          ? payloadRecord.summaryGenerationTimestamp
          : typeof payloadRecord.summary_generation_timestamp === "string"
            ? payloadRecord.summary_generation_timestamp
            : typeof row.created_at === "string"
              ? row.created_at
              : null;

      return {
        summary,
        summaryHash,
        summarySource: "cache",
        summaryGenerationDurationMs: 0,
        summaryGenerationTimestamp,
        summaryModel:
          typeof payloadRecord.summaryModel === "string"
            ? payloadRecord.summaryModel
            : typeof payloadRecord.summary_model === "string"
              ? payloadRecord.summary_model
              : config.OPENAI_JUDGE_MODEL,
        summaryVersion:
          typeof payloadRecord.summaryVersion === "string"
            ? payloadRecord.summaryVersion
            : typeof payloadRecord.summary_version === "string"
              ? payloadRecord.summary_version
              : SCRIPT_SUMMARY_VERSION,
      };
    }
    return null;
  } catch (error) {
    logger.warn("Legacy script summary read threw", {
      scriptId,
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function tryAcquireScriptSummaryGenerationLock(
  scriptId: string,
  versionId: string,
  lockOwner: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("try_acquire_analysis_script_summary_lock", {
      p_script_id: scriptId,
      p_version_id: versionId,
      p_lock_owner: lockOwner,
      p_lock_ttl_ms: config.SCRIPT_SUMMARY_LOCK_TTL_MS,
    });

    if (error) {
      logger.warn("Script summary lock acquisition failed", {
        scriptId,
        versionId,
        error: error.message,
      });
      return false;
    }

    return data === true;
  } catch (error) {
    logger.warn("Script summary lock acquisition threw", {
      scriptId,
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function releaseScriptSummaryGenerationLock(
  scriptId: string,
  versionId: string,
  lockOwner: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("release_analysis_script_summary_lock", {
      p_script_id: scriptId,
      p_version_id: versionId,
      p_lock_owner: lockOwner,
    });

    if (error) {
      logger.warn("Script summary lock release failed", {
        scriptId,
        versionId,
        error: error.message,
      });
    }
  } catch (error) {
    logger.warn("Script summary lock release threw", {
      scriptId,
      versionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function waitForPersistedScriptSummary(
  scriptId: string,
  versionId: string,
): Promise<ResolvedScriptSummary | null> {
  const deadline = Date.now() + config.SCRIPT_SUMMARY_LOCK_WAIT_MS;
  while (Date.now() <= deadline) {
    const persisted = await loadPersistedScriptSummary(scriptId, versionId);
    if (persisted) return persisted;
    await sleep(config.SCRIPT_SUMMARY_LOCK_POLL_MS);
  }
  return null;
}

async function persistScriptSummary(args: {
  scriptId: string;
  versionId: string;
  summary: ScriptSummaryPayload;
  summaryHash: string;
  summaryGenerationTimestamp: string;
  summaryModel: string;
  summaryVersion: string;
}): Promise<boolean> {
  const row = {
    script_id: args.scriptId,
    version_id: args.versionId,
    summary_json: args.summary,
    summary_hash: args.summaryHash,
    summary_generation_timestamp: args.summaryGenerationTimestamp,
    summary_model: args.summaryModel,
    summary_version: args.summaryVersion,
  };

  const { error } = await supabase
    .from("analysis_script_summaries")
    .upsert(row, { onConflict: "script_id,version_id" });

  if (error) {
    logger.warn("Script summary persistence failed", {
      scriptId: args.scriptId,
      versionId: args.versionId,
      error: error.message,
    });
    return false;
  }

  return true;
}

const SYSTEM_MSG = `أنت مدقق محتوى. مهمتك فهم النص كقصة: أحداث، حوارات، أوصاف، وموقف السرد.
أرجع JSON فقط بالشكل:
{
   "synopsis_ar": "ملخص موجز للحبكة والشخصيات والمسار العام (2-4 جمل)",
   "main_characters_ar": "أسماء الشخصيات الرئيسية وأدوارها في القصة باختصار",
   "relationship_map_ar": "العلاقات المهمة بين الشخصيات: أسرة، خصومة، سلطة، ضحية/معتدي، إن أمكن",
   "key_risky_events_ar": "أهم المشاهد أو الأحداث التي قد تثير مخاوف امتثال (إن وُجدت)، بشكل مختصر",
  "narrative_stance_ar": "موقف السرد من السلوكيات الحساسة: إدانة، تطبيع، أو محايد",
  "compliance_posture_ar": "انطباع عام عن مدى توافق النص مع ضوابط المحتوى",
  "confidence": عدد بين 0 و 1
}
لا تفسير خارج JSON.`;

async function generateScriptSummaryInternal(fullText: string, scriptTitle?: string): Promise<ScriptSummaryPayload | null> {
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
      temperature: 0,
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
      main_characters_ar: typeof parsed.main_characters_ar === "string" ? parsed.main_characters_ar : undefined,
      relationship_map_ar: typeof parsed.relationship_map_ar === "string" ? parsed.relationship_map_ar : undefined,
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

export async function generateScriptSummary(
  fullText: string,
  scriptTitle?: string
): Promise<ScriptSummaryPayload | null> {
  return generateScriptSummaryInternal(fullText, scriptTitle);
}

export async function resolveScriptSummary(args: {
  scriptId: string;
  versionId: string;
  inputText: string;
  scriptTitle?: string;
}): Promise<ResolvedScriptSummary> {
  const cached = await loadPersistedScriptSummary(args.scriptId, args.versionId);
  if (cached) return cached;

  const legacy = await loadLegacyScriptSummary(args.scriptId, args.versionId);
  if (legacy) {
    if (legacy.summary) {
      void persistScriptSummary({
        scriptId: args.scriptId,
        versionId: args.versionId,
        summary: legacy.summary,
        summaryHash: legacy.summaryHash ?? computeScriptSummaryHash(legacy.summary),
        summaryGenerationTimestamp: legacy.summaryGenerationTimestamp ?? new Date().toISOString(),
        summaryModel: legacy.summaryModel ?? config.OPENAI_JUDGE_MODEL,
        summaryVersion: legacy.summaryVersion ?? SCRIPT_SUMMARY_VERSION,
      }).catch((error) => {
        logger.warn("Legacy script summary backfill failed", {
          scriptId: args.scriptId,
          versionId: args.versionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
    return legacy;
  }

  const lockOwner = randomUUID();
  const acquired = await tryAcquireScriptSummaryGenerationLock(args.scriptId, args.versionId, lockOwner);
  if (!acquired) {
    const waited = await waitForPersistedScriptSummary(args.scriptId, args.versionId);
    if (waited) return waited;
    return {
      summary: null,
      summaryHash: null,
      summarySource: "unavailable",
      summaryGenerationDurationMs: 0,
      summaryGenerationTimestamp: null,
      summaryModel: null,
      summaryVersion: SCRIPT_SUMMARY_VERSION,
    };
  }

  try {
    const persistedAfterLock = await loadPersistedScriptSummary(args.scriptId, args.versionId);
    if (persistedAfterLock) return persistedAfterLock;

    const inputText = args.inputText?.trim() ?? "";
    if (!inputText) {
      return {
        summary: null,
        summaryHash: null,
        summarySource: "unavailable",
        summaryGenerationDurationMs: 0,
        summaryGenerationTimestamp: null,
        summaryModel: null,
        summaryVersion: SCRIPT_SUMMARY_VERSION,
      };
    }

    const generationStartedAt = Date.now();
    const summary = await generateScriptSummaryInternal(inputText, args.scriptTitle);
    const generationDurationMs = Date.now() - generationStartedAt;

    if (!summary) {
      return {
        summary: null,
        summaryHash: null,
        summarySource: "unavailable",
        summaryGenerationDurationMs: generationDurationMs,
        summaryGenerationTimestamp: null,
        summaryModel: config.OPENAI_JUDGE_MODEL,
        summaryVersion: SCRIPT_SUMMARY_VERSION,
      };
    }

    const summaryHash = computeScriptSummaryHash(summary);
    const summaryGenerationTimestamp = new Date().toISOString();
    void persistScriptSummary({
      scriptId: args.scriptId,
      versionId: args.versionId,
      summary,
      summaryHash,
      summaryGenerationTimestamp,
      summaryModel: config.OPENAI_JUDGE_MODEL,
      summaryVersion: SCRIPT_SUMMARY_VERSION,
    }).catch((error) => {
      logger.warn("Generated script summary persistence failed", {
        scriptId: args.scriptId,
        versionId: args.versionId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return {
      summary,
      summaryHash,
      summarySource: "generated",
      summaryGenerationDurationMs: generationDurationMs,
      summaryGenerationTimestamp,
      summaryModel: config.OPENAI_JUDGE_MODEL,
      summaryVersion: SCRIPT_SUMMARY_VERSION,
    };
  } finally {
    await releaseScriptSummaryGenerationLock(args.scriptId, args.versionId, lockOwner);
  }
}
