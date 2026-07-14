import { createLegalDecision } from "../legal/legalDecision.js";
import type { LegalNarrativeResult } from "../legal/legalTypes.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";

function containsAny(text: string, terms: readonly string[]): boolean {
  const normalized = text.normalize("NFC").toLowerCase();
  return terms.some((term) => normalized.includes(term.normalize("NFC").toLowerCase()));
}

function detectDialogue(text: string): boolean {
  return /^\s*[A-Za-z\u0600-\u06FF]+\s*:/m.test(text) || /«.*»/.test(text) || /".*"/.test(text);
}

export function runNarrativeStage(chunk: V3PipelineChunk): LegalNarrativeResult {
  const text = chunk.text;
  const dialogue = detectDialogue(text);
  const narration = !dialogue;
  const sentence = text.trim();
  const condemnation = containsAny(sentence, ["مرفوض", "يستنكر", "يدين", "لا يجوز", "رفض", "مذموم"]);
  const approval = containsAny(sentence, ["ممتاز", "رائع", "جميل", "مقبول", "عادي"]);
  const neutrality = !condemnation && !approval;
  const historicalContext = containsAny(sentence, ["تاريخ", "في الرواية", "في الماضي", "سابقًا", "كان"]);
  const instructional = containsAny(sentence, ["في الدرس", "تعلم", "يشرح", "شرح", "مثال", "أمثلة"]);
  const quote = /«.*»|".*"/.test(sentence);
  const narrativeIntent = condemnation
    ? "condemnation"
    : instructional
      ? "instruction"
      : quote
        ? "quoted"
        : dialogue
          ? "dialogue"
          : "narration";

  return Object.freeze({
    speaker: dialogue ? "speaker" : null,
    listener: dialogue ? "listener" : null,
    target: dialogue ? "listener" : null,
    narrativeVoice: dialogue ? "dialogue" : "narration",
    sceneType: dialogue ? "dialogue scene" : "narration",
    narrativeIntent,
    storyPosition: "unknown",
    relationship: dialogue ? "unknown" : null,
    emotionalTone: condemnation ? "critical" : dialogue ? "neutral" : "neutral",
    condemnation,
    approval,
    neutrality,
    historicalContext,
    dream: containsAny(sentence, ["حلم", "في المنام"]),
    flashback: containsAny(sentence, ["في الماضي", "تذكّر", "تذكر"]),
    comedy: containsAny(sentence, ["مزاح", "ضحك", "كوميدي"]),
    satire: containsAny(sentence, ["سخرية", "ساخر", "تهكم"]),
    threat: containsAny(sentence, ["سأضرب", "سأؤذي", "سأقتلك", "تهديد"]),
    instruction: instructional,
    news: containsAny(sentence, ["خبر", "أفادت", "ذكرت"]),
    documentary: containsAny(sentence, ["وثائقي", "وثيقة", "توثيق"]),
    dialogue,
    narration,
    sceneDescription: narration,
    confidence: 0.92,
    notes: [],
  });
}
