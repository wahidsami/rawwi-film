import type { SceneAnalysisSentence, SceneAnalysisState, SceneModel, SceneModelLine } from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

export type SceneUnderstandingPrompt = Readonly<{
  systemPrompt: string;
  userPrompt: string;
}>;

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value).toLowerCase();
}

function classifyLineType(text: string): SceneModelLine["lineType"] {
  const normalized = normalizeKey(text);
  if (/^(?:int\.?|ext\.?|int\/ext\.?|داخلي|خارجي)/iu.test(normalized)) {
    return "heading";
  }
  if (/(?:to:|cut to|fade in|fade out|dissolve|قطع إلى|انتقال إلى)/u.test(normalized)) {
    return "transition";
  }
  if (/[:«»"“”']/u.test(text) || /^\s*[-–]\s*/u.test(text)) {
    return "dialogue";
  }
  return "action";
}

function extractSpeakerHint(text: string): string | null {
  const match = text.match(/^\s*([^\n:]{1,40}?)\s*:/u);
  if (!match) {
    return null;
  }
  const speaker = normalizeText(match[1] ?? "");
  return speaker.length > 0 ? speaker : null;
}

function splitSceneLines(sceneText: string): readonly SceneModelLine[] {
  const lines: SceneModelLine[] = [];
  const normalizedText = sceneText.replace(/\r\n/g, "\n");
  let cursor = 0;
  const segments = normalizedText.split("\n");

  for (const [index, rawLine] of segments.entries()) {
    const line = rawLine.trim();
    const startOffset = normalizedText.indexOf(rawLine, cursor);
    const endOffset = startOffset + rawLine.length;
    cursor = endOffset + 1;

    if (line.length === 0) {
      continue;
    }

    lines.push(Object.freeze({
      lineId: `line-${index + 1}`,
      text: line,
      startOffset,
      endOffset,
      lineType: classifyLineType(line),
    }));
  }

  return Object.freeze(lines);
}

function splitSentences(sceneText: string): readonly SceneAnalysisSentence[] {
  const sentences: SceneAnalysisSentence[] = [];
  const lines = splitSceneLines(sceneText);

  for (const [index, line] of lines.entries()) {
    if (line.lineType === "heading") {
      continue;
    }

    sentences.push(Object.freeze({
      sentenceId: `sentence-${sentences.length + 1}`,
      text: line.text,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      sourceType: line.lineType === "dialogue" ? "dialogue" : line.lineType === "action" ? "scene_description" : "story_context",
    }));
  }

  return Object.freeze(sentences);
}

function buildSceneHeading(lines: readonly SceneModelLine[]): SceneModel["heading"] {
  const headingLine = lines.find((line) => line.lineType === "heading") ?? null;
  if (!headingLine) {
    return Object.freeze({
      raw: null,
      sceneType: "unknown",
      location: null,
      timeOfDay: null,
    });
  }

  const headingText = headingLine.text;
  const normalized = normalizeKey(headingText);
  const sceneType: SceneModel["heading"]["sceneType"] = /(?:داخلي|int)/u.test(normalized) && /(?:خارجي|ext)/u.test(normalized)
    ? "mixed"
    : /(?:داخلي|int)/u.test(normalized)
      ? "interior"
      : /(?:خارجي|ext)/u.test(normalized)
        ? "exterior"
        : "unknown";

  const [rawLocation, rawTime] = headingText.split(/\s*[-–—]\s*/u);
  return Object.freeze({
    raw: headingText,
    sceneType,
    location: rawLocation ? rawLocation.replace(/^(?:INT\.?|EXT\.?|INT\/EXT\.?|داخلي|خارجي)\s*/iu, "").trim() || null : null,
    timeOfDay: rawTime?.trim() || null,
  });
}

function buildCharacters(lines: readonly SceneModelLine[]): readonly string[] {
  const names = new Set<string>();
  for (const line of lines) {
    const speaker = extractSpeakerHint(line.text);
    if (speaker) {
      names.add(speaker);
    }
  }
  return Object.freeze([...names].sort((left, right) => left.localeCompare(right)));
}

function buildSceneSummary(model: Readonly<{
  lines: readonly SceneModelLine[];
  dialogueLines: readonly SceneModelLine[];
  actionLines: readonly SceneModelLine[];
  characters: readonly string[];
}>): string {
  return `Scene contains ${model.lines.length} line(s), ${model.dialogueLines.length} dialogue line(s), ${model.actionLines.length} action line(s), and ${model.characters.length} character hint(s).`;
}

export function buildSceneUnderstandingPrompt(sceneText: string): SceneUnderstandingPrompt {
  return Object.freeze({
    systemPrompt: [
      "You are a screenplay reader, not a reviewer.",
      "Read the scene and return a structured SceneModel only.",
      "Do not classify violations.",
      "Do not assign articles.",
      "Do not produce findings.",
      "Focus on screenplay structure, dialogue, action, heading, setting, characters, and scene flow.",
      "Return only facts visible in the scene.",
    ].join(" "),
    userPrompt: sceneText,
  });
}

export function understandScene(sceneId: string, sceneText: string): SceneModel {
  const lines = splitSceneLines(sceneText);
  const sentences = splitSentences(sceneText);
  const dialogueLines = Object.freeze(lines.filter((line) => line.lineType === "dialogue"));
  const actionLines = Object.freeze(lines.filter((line) => line.lineType === "action"));
  const heading = buildSceneHeading(lines);
  const normalizedSceneText = normalizeText(sceneText);
  const characters = buildCharacters(dialogueLines);

  return Object.freeze({
    sceneId,
    rawSceneText: sceneText,
    normalizedSceneText,
    heading,
    lines,
    sentences,
    dialogueLines,
    actionLines,
    characters,
    summary: buildSceneSummary({
      lines,
      dialogueLines,
      actionLines,
      characters,
    }),
  });
}

export function createSceneUnderstandingNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const sceneModel = understandScene(state.sceneId, state.sceneText);
    return freezeSceneAnalysisState({
      ...state,
      sceneModel,
      normalizedSceneText: sceneModel.normalizedSceneText,
      sentences: sceneModel.sentences,
      status: state.status === "pending" ? "running" : state.status,
    });
  };
}
