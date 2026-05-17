export type SceneEventType =
  | "physical_abuse"
  | "verbal_abuse"
  | "threat"
  | "religious_reference"
  | "state_leadership_reference"
  | "national_security_reference"
  | "historical_claim"
  | "sexual_content"
  | "drug_or_alcohol"
  | "bullying"
  | "other";

export type SceneTargetClass =
  | "child"
  | "woman"
  | "person_with_disability"
  | "public_group"
  | "state_or_leadership"
  | "religious_symbol"
  | "unknown";

export type SceneFraming = "positive" | "neutral" | "negative" | "unclear";

export interface SceneEvent {
  event_id: string;
  event_type: SceneEventType;
  actor_label: string | null;
  target_label: string | null;
  target_class: SceneTargetClass;
  action_mode: "speech" | "action" | "narration" | "visual" | "unknown";
  intent_signal:
    | "harm"
    | "insult"
    | "advocacy"
    | "instruction"
    | "ridicule"
    | "factual_claim"
    | "unknown";
  framing: SceneFraming;
  promoted: boolean;
  glorified: boolean;
  repeated: boolean;
  documentary_context: boolean;
  factual_claim_present: boolean;
  evidence_snippet: string;
  start_offset: number | null;
  end_offset: number | null;
  extraction_confidence: number;
}

export interface SceneAnalysisResult {
  events: SceneEvent[];
}

const EVENT_TYPES: SceneEventType[] = [
  "physical_abuse",
  "verbal_abuse",
  "threat",
  "religious_reference",
  "state_leadership_reference",
  "national_security_reference",
  "historical_claim",
  "sexual_content",
  "drug_or_alcohol",
  "bullying",
  "other",
];

const TARGET_CLASSES: SceneTargetClass[] = [
  "child",
  "woman",
  "person_with_disability",
  "public_group",
  "state_or_leadership",
  "religious_symbol",
  "unknown",
];

const ACTION_MODES: SceneEvent["action_mode"][] = [
  "speech",
  "action",
  "narration",
  "visual",
  "unknown",
];

const INTENT_SIGNALS: SceneEvent["intent_signal"][] = [
  "harm",
  "insult",
  "advocacy",
  "instruction",
  "ridicule",
  "factual_claim",
  "unknown",
];

const FRAMINGS: SceneFraming[] = ["positive", "neutral", "negative", "unclear"];

export function clampConfidence(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function isSceneEvent(value: unknown): value is SceneEvent {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.event_id === "string" &&
    typeof row.event_type === "string" &&
    typeof row.target_class === "string" &&
    typeof row.action_mode === "string" &&
    typeof row.intent_signal === "string" &&
    typeof row.framing === "string" &&
    typeof row.promoted === "boolean" &&
    typeof row.glorified === "boolean" &&
    typeof row.repeated === "boolean" &&
    typeof row.documentary_context === "boolean" &&
    typeof row.factual_claim_present === "boolean" &&
    typeof row.evidence_snippet === "string"
  );
}

function asEnum<T extends string>(value: unknown, choices: T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  return (choices as string[]).includes(value) ? (value as T) : fallback;
}

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }
  return false;
}

export function normalizeSceneAnalysisResult(raw: unknown): SceneAnalysisResult {
  const eventsRaw =
    raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).events)
      ? ((raw as Record<string, unknown>).events as unknown[])
      : [];

  const events: SceneEvent[] = eventsRaw
    .filter(isSceneEvent)
    .map((event) => ({
      ...event,
      event_type: asEnum(event.event_type, EVENT_TYPES, "other"),
      target_class: asEnum(event.target_class, TARGET_CLASSES, "unknown"),
      action_mode: asEnum(event.action_mode, ACTION_MODES, "unknown"),
      intent_signal: asEnum(event.intent_signal, INTENT_SIGNALS, "unknown"),
      framing: asEnum(event.framing, FRAMINGS, "unclear"),
      promoted: asBoolean(event.promoted),
      glorified: asBoolean(event.glorified),
      repeated: asBoolean(event.repeated),
      documentary_context: asBoolean(event.documentary_context),
      factual_claim_present: asBoolean(event.factual_claim_present),
      extraction_confidence: clampConfidence(event.extraction_confidence),
      actor_label: typeof event.actor_label === "string" ? event.actor_label : null,
      target_label: typeof event.target_label === "string" ? event.target_label : null,
      start_offset: typeof event.start_offset === "number" ? event.start_offset : null,
      end_offset: typeof event.end_offset === "number" ? event.end_offset : null,
      evidence_snippet: event.evidence_snippet.trim(),
    }))
    .filter((event) => event.evidence_snippet.length > 0);

  return { events };
}
