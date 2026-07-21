import OpenAI from "openai";

import { config } from "../config.js";
import { canonicalStringify } from "../canonicalJson.js";
import { sha256 } from "../hash.js";
import type {
  SemanticSceneEvent,
  SemanticSceneModel,
  SemanticSceneRelationship,
  SemanticSceneTimelineEntry,
  SceneAnalysisState,
  SceneModel,
} from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

type SemanticSceneInterpretation = Readonly<{
  semanticSceneModel: SemanticSceneModel;
  semanticSceneResponse: string;
}>;

export type InterpretSceneNodeInput = Readonly<{
  sceneModel: SceneModel;
}>;

export type InterpretSceneNodeOptions = Readonly<{
  interpretScene?: (input: InterpretSceneNodeInput) => Promise<SemanticSceneInterpretation> | SemanticSceneInterpretation;
  useOpenAI?: boolean;
}>;

const openai = config.OPENAI_API_KEY ? new OpenAI({ apiKey: config.OPENAI_API_KEY }) : null;

const PROBLEM_PATTERNS: readonly Readonly<{ concept: string; eventType: string; regex: RegExp }>[] = Object.freeze([
  { concept: "profanity", eventType: "Insult", regex: /(?:كس\s*امة|يا\s+(?:كلب|حمار|خنزير|غبي|حقير|قذر|وسخ|لعين)|شتيمة|شتائم|سباب|سب|شتم|يا[.…\.]{1,})/u },
  { concept: "hostility", eventType: "Threat", regex: /(?:موتوا|موتي|موتو|خلصوني منكم|اخرجوا|انقلع|أكرهك|أكرهكم|سحقا|سحقاً)/u },
  { concept: "violence", eventType: "Physical Abuse", regex: /(?:اقتل|أقتل|قتل|سأقتلك|أذبح|أضرب|طعن|دماء|ضرب|عنف)/u },
  { concept: "threat", eventType: "Threat", regex: /(?:سأقتلك|أقتلك|سأذبحك|أذبحك|سأضربك|أضربك|سأنشر|سأفضحك|سأحرقك|تهديد)/u },
  { concept: "crime", eventType: "Fraud", regex: /(?:سرقة|أسرق|ثب|ابتزاز|رشوة|فساد|مجرم|جريمة|اختلاس|احتيال)/u },
  { concept: "drugs", eventType: "Drug Use", regex: /(?:مخدر|حشيش|خمر|سكران|مخدرات|تعاطي)/u },
  { concept: "religion", eventType: "Religious Discussion", regex: /(?:دين|إسلام|مسلم|مسيحي|صلاة|مسجد|كنيسة|الله|الرسول|النبي)/u },
  { concept: "politics", eventType: "Political Discussion", regex: /(?:حكومة|دولة|وزارة|نظام|رئيس|قيادة|سياسة|انتخابات|سياسي|السلطة)/u },
  { concept: "children", eventType: "Bullying", regex: /(?:طفل|طفلة|قاصر|أطفال|أولاد|يا صغير)/u },
  { concept: "sexuality", eventType: "Sexual Conduct", regex: /(?:جنس|جنسي|عاري|عري|فاحش|إباحية|محتوى جنسي)/u },
  { concept: "security", eventType: "Terrorist Recruitment", regex: /(?:إرهاب|انفجار|تفجير|تهديد|شرطة|جيش|عسكري|أمن|سلاح|قنبلة)/u },
  { concept: "privacy", eventType: "Media Broadcast", regex: /(?:خصوصية|صورة خاصة|صور خاصة|بيانات شخصية|فضح|تسريب)/u },
]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function extractParticipants(sceneModel: SceneModel): readonly string[] {
  return uniqueSorted(sceneModel.characters);
}

function inferSensitiveConcepts(sceneModel: SceneModel): readonly string[] {
  const text = normalizeText(sceneModel.sentences.map((sentence) => sentence.text).join(" "));
  const concepts = PROBLEM_PATTERNS
    .filter((pattern) => pattern.regex.test(text))
    .map((pattern) => pattern.concept);
  if (concepts.length === 0 && sceneModel.dialogueLines.length > 0) {
    return freeze(["dialogue"]);
  }
  return uniqueSorted(concepts);
}

function inferEventType(sentence: string): { eventType: string; concept: string | null } {
  const text = normalizeText(sentence);
  for (const pattern of PROBLEM_PATTERNS) {
    if (pattern.regex.test(text)) {
      return { eventType: pattern.eventType, concept: pattern.concept };
    }
  }
  if (text.length === 0) {
    return { eventType: "Scene Observation", concept: null };
  }
  if (/[:«»"“”']/u.test(text)) {
    return { eventType: "Dialogue", concept: null };
  }
  return { eventType: "Scene Observation", concept: null };
}

function buildRelationships(sceneModel: SceneModel): readonly SemanticSceneRelationship[] {
  const participants = extractParticipants(sceneModel);
  if (participants.length < 2) {
    return freeze([]);
  }

  return freeze([
    freeze({
      subject: participants[0] ?? "unknown",
      relation: "interacts_with",
      object: participants[1] ?? "unknown",
      evidence: sceneModel.dialogueLines[0]?.text ?? sceneModel.sentences[0]?.text ?? null,
    }),
  ]);
}

function buildEvents(sceneModel: SceneModel): readonly SemanticSceneEvent[] {
  const events: SemanticSceneEvent[] = [];
  for (const [index, sentence] of sceneModel.sentences.entries()) {
    const inference = inferEventType(sentence.text);
    events.push(freeze({
      eventType: inference.eventType,
      description: sentence.text,
      evidence: sentence.text,
      participants: extractParticipants(sceneModel),
    }));
    if (index >= 6) break;
  }
  return freeze(events);
}

function buildTimeline(events: readonly SemanticSceneEvent[]): readonly SemanticSceneTimelineEntry[] {
  return freeze(events.map((event, index) => freeze({
    order: index + 1,
    description: event.description,
    evidence: event.evidence,
  })));
}

function inferSpeakerIntent(events: readonly SemanticSceneEvent[], sceneModel: SceneModel): string {
  if (events.some((event) => /Threat|Physical Abuse|Insult/i.test(event.eventType))) {
    return "hostile";
  }
  if (sceneModel.dialogueLines.length > 0) {
    return "conversational";
  }
  return "observational";
}

function inferEmotionalState(events: readonly SemanticSceneEvent[]): string {
  if (events.some((event) => /Threat|Physical Abuse/i.test(event.eventType))) {
    return "tense";
  }
  if (events.some((event) => /Insult/i.test(event.eventType))) {
    return "aggressive";
  }
  return "neutral";
}

function inferScenePurpose(sceneModel: SceneModel, concepts: readonly string[]): string {
  if (concepts.includes("profanity") || concepts.includes("hostility")) {
    return "confrontation";
  }
  if (concepts.includes("religion")) {
    return "discussion";
  }
  if (sceneModel.dialogueLines.length > 0) {
    return "conversation";
  }
  return "observation";
}

function inferSceneOutcome(events: readonly SemanticSceneEvent[]): string {
  if (events.some((event) => /Threat|Physical Abuse/i.test(event.eventType))) {
    return "escalation";
  }
  if (events.some((event) => /Dialogue/i.test(event.eventType))) {
    return "exchange_of_information";
  }
  return "static";
}

function buildDeterministicInterpretation(sceneModel: SceneModel): SemanticSceneInterpretation {
  const participants = extractParticipants(sceneModel);
  const sensitiveConcepts = inferSensitiveConcepts(sceneModel);
  const events = buildEvents(sceneModel);
  const timeline = buildTimeline(events);

  const semanticSceneModel: SemanticSceneModel = freeze({
    summary: sceneModel.summary,
    participants,
    relationships: buildRelationships(sceneModel),
    events,
    timeline,
    speakerIntent: inferSpeakerIntent(events, sceneModel),
    emotionalState: inferEmotionalState(events),
    victims: freeze(participants.length > 1 ? [participants[1] ?? participants[0] ?? "unknown"] : []),
    aggressors: freeze(events.some((event) => /Threat|Physical Abuse|Insult/i.test(event.eventType)) && participants.length > 0 ? [participants[0] ?? "unknown"] : []),
    targets: freeze(participants.slice(1, 2)),
    sensitiveConcepts,
    scenePurpose: inferScenePurpose(sceneModel, sensitiveConcepts),
    sceneOutcome: inferSceneOutcome(events),
    confidence: Number((Math.min(1, 0.7 + (events.length * 0.03))).toFixed(6)),
  });

  return freeze({
    semanticSceneModel,
    semanticSceneResponse: JSON.stringify(semanticSceneModel),
  });
}

function buildPrompt(sceneModel: SceneModel): Readonly<{ systemPrompt: string; userPrompt: string }> {
  return freeze({
    systemPrompt: [
      "You are a screenplay semantic interpreter, not a reviewer.",
      "Explain what actually happened in the scene.",
      "Return only facts visible in the current SceneModel.",
      "Do not classify policy violations.",
      "Do not assign legal articles.",
      "Do not invent context from other scenes.",
      "Return strict JSON only.",
    ].join(" "),
    userPrompt: canonicalStringify({
      sceneId: sceneModel.sceneId,
      summary: sceneModel.summary,
      heading: sceneModel.heading,
      characters: sceneModel.characters,
      dialogueLines: sceneModel.dialogueLines.map((line) => line.text),
      actionLines: sceneModel.actionLines.map((line) => line.text),
      sentences: sceneModel.sentences.map((sentence) => sentence.text),
    }),
  });
}

async function interpretWithOpenAI(sceneModel: SceneModel): Promise<SemanticSceneInterpretation> {
  if (!openai) {
    return buildDeterministicInterpretation(sceneModel);
  }

  const { systemPrompt, userPrompt } = buildPrompt(sceneModel);
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const response = await openai.chat.completions.create({
    model: config.OPENAI_RATIONALE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    seed: 12345,
    max_tokens: 2048,
  });
  const raw = response.choices[0]?.message?.content ?? "{}";
  const finishedAt = globalThis.performance?.now?.() ?? Date.now();
  const durationMs = Math.max(0, finishedAt - startedAt);
  try {
    const parsed = JSON.parse(raw) as Partial<SemanticSceneModel>;
    const fallback = buildDeterministicInterpretation(sceneModel);
    const semanticSceneModel: SemanticSceneModel = freeze({
      summary: typeof parsed.summary === "string" && parsed.summary.trim().length > 0 ? parsed.summary : fallback.semanticSceneModel.summary,
      participants: Array.isArray(parsed.participants) ? uniqueSorted(parsed.participants.map(String)) : fallback.semanticSceneModel.participants,
      relationships: Array.isArray(parsed.relationships)
        ? freeze(parsed.relationships.map((relationship) => {
            const record = relationship as Record<string, unknown>;
            return freeze({
              subject: String(record.subject ?? ""),
              relation: String(record.relation ?? ""),
              object: String(record.object ?? ""),
              evidence: record.evidence == null ? null : String(record.evidence),
            });
          }))
        : fallback.semanticSceneModel.relationships,
      events: Array.isArray(parsed.events)
        ? freeze(parsed.events.map((event) => {
            const record = event as Record<string, unknown>;
            const participants = Array.isArray(record.participants) ? uniqueSorted(record.participants.map(String)) : fallback.semanticSceneModel.participants;
            return freeze({
              eventType: String(record.eventType ?? "Scene Observation"),
              description: String(record.description ?? ""),
              evidence: String(record.evidence ?? ""),
              participants,
            });
          }))
        : fallback.semanticSceneModel.events,
      timeline: Array.isArray(parsed.timeline) ? freeze(parsed.timeline.map((entry, index) => freeze({
        order: Number((entry as Record<string, unknown>).order ?? index + 1),
        description: String((entry as Record<string, unknown>).description ?? ""),
        evidence: (entry as Record<string, unknown>).evidence == null ? null : String((entry as Record<string, unknown>).evidence),
      }))) : fallback.semanticSceneModel.timeline,
      speakerIntent: typeof parsed.speakerIntent === "string" && parsed.speakerIntent.trim().length > 0 ? parsed.speakerIntent : fallback.semanticSceneModel.speakerIntent,
      emotionalState: typeof parsed.emotionalState === "string" && parsed.emotionalState.trim().length > 0 ? parsed.emotionalState : fallback.semanticSceneModel.emotionalState,
      victims: Array.isArray(parsed.victims) ? uniqueSorted(parsed.victims.map(String)) : fallback.semanticSceneModel.victims,
      aggressors: Array.isArray(parsed.aggressors) ? uniqueSorted(parsed.aggressors.map(String)) : fallback.semanticSceneModel.aggressors,
      targets: Array.isArray(parsed.targets) ? uniqueSorted(parsed.targets.map(String)) : fallback.semanticSceneModel.targets,
      sensitiveConcepts: Array.isArray(parsed.sensitiveConcepts) ? uniqueSorted(parsed.sensitiveConcepts.map(String)) : fallback.semanticSceneModel.sensitiveConcepts,
      scenePurpose: typeof parsed.scenePurpose === "string" && parsed.scenePurpose.trim().length > 0 ? parsed.scenePurpose : fallback.semanticSceneModel.scenePurpose,
      sceneOutcome: typeof parsed.sceneOutcome === "string" && parsed.sceneOutcome.trim().length > 0 ? parsed.sceneOutcome : fallback.semanticSceneModel.sceneOutcome,
      confidence: typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : fallback.semanticSceneModel.confidence,
    });

    return freeze({
      semanticSceneModel,
      semanticSceneResponse: raw,
    });
  } catch {
    const fallback = buildDeterministicInterpretation(sceneModel);
    return freeze({
      semanticSceneModel: fallback.semanticSceneModel,
      semanticSceneResponse: raw,
    });
  }
}

export function buildInterpretScenePrompt(sceneModel: SceneModel): Readonly<{ systemPrompt: string; userPrompt: string }> {
  return buildPrompt(sceneModel);
}

export function interpretScene(sceneModel: SceneModel): Promise<SemanticSceneInterpretation> {
  return interpretWithOpenAI(sceneModel);
}

export function createInterpretSceneNode(dependencies: InterpretSceneNodeOptions = {}) {
  return async (state: SceneAnalysisState): Promise<SceneAnalysisState> => {
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const fallbackSceneModel: SceneModel = {
      sceneId: state.sceneId,
      rawSceneText: state.sceneText,
      normalizedSceneText: state.normalizedSceneText,
      heading: state.sceneModel?.heading ?? { raw: null, sceneType: "unknown", location: null, timeOfDay: null },
      lines: [],
      sentences: state.sentences,
      dialogueLines: [],
      actionLines: [],
      characters: [],
      summary: state.sceneModel?.summary ?? state.normalizedSceneText,
    };
    const sceneModel = state.sceneModel ?? fallbackSceneModel;
    const interpretation = dependencies.interpretScene
      ? await dependencies.interpretScene({ sceneModel })
      : await interpretScene(sceneModel);
    const finishedAt = globalThis.performance?.now?.() ?? Date.now();

    return freezeSceneAnalysisState({
      ...state,
      semanticSceneModel: interpretation.semanticSceneModel,
      semanticSceneResponse: interpretation.semanticSceneResponse,
      semanticSceneDurationMs: Math.max(0, finishedAt - startedAt),
    });
  };
}
