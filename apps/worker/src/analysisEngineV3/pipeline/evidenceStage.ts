import type { LegalEvidenceResult } from "../legal/legalTypes.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";
import { isProfanityEvidenceText } from "../legal/modules/profanity/profanityModule.js";
import { splitSentenceEvidenceCandidates } from "../evidence/evidenceCandidates.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function detectDialogue(text: string): boolean {
  return /^\s*[A-Za-z\u0600-\u06FF]+\s*:/m.test(text) || /«.*»|".*"/.test(text);
}

function detectSceneDescription(text: string): boolean {
  const normalized = normalizeText(text);
  return Boolean(normalized) && !detectDialogue(normalized) && /(?:داخل|خارج|ليل|نهار|غرفة|شارع|منزل|بيت|scene|interior|exterior)/iu.test(normalized);
}

function extractNumericMetadata(metadata: V3PipelineChunk["metadata"], keys: readonly string[]): number | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function extractTextMetadata(metadata: V3PipelineChunk["metadata"], keys: readonly string[]): string | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.normalize("NFC").trim().length > 0) {
      return normalizeText(value);
    }
  }
  return null;
}

function buildObservedFacts(quote: string, evidenceType: NonNullable<LegalEvidenceResult["evidenceType"]>): readonly string[] {
  const facts = [
    `Observed evidence: ${quote}`,
    evidenceType === "dialogue" ? "Speaker delivered dialogue." : "No dialogue marker detected.",
    evidenceType === "scene_description" ? "The fragment is scene description." : "The fragment is not scene description.",
    isProfanityEvidenceText(quote) ? "Profanity is literally present in the grounded evidence." : "No explicit profanity marker was detected.",
    /(?:سأقتلك|أقتلك|سأضربك|أضربك|قتل|ضرب|تهديد|attack|kill|murder|violence|violent)/iu.test(quote)
      ? "Physical harm or threat is literally present."
      : "No physical violence is stated.",
    /(?:دين|إسلام|مسلم|مسيحي|مسجد|كنيسة|الله|الرسول|النبي|religion|religious)/iu.test(quote)
      ? "Religion is explicitly referenced."
      : "No religion is explicitly referenced.",
    /(?:حكومة|دولة|وزارة|رئيس|قيادة|سياسة|politics|political|government)/iu.test(quote)
      ? "Politics or governance is explicitly referenced."
      : "No politics is explicitly referenced.",
    /(?:طفل|طفلة|قاصر|أطفال|children|child|minor)/iu.test(quote)
      ? "A child-related reference is explicitly present."
      : "No child-related reference is explicit.",
    /(?:مخدر|حشيش|خمر|drugs|drug|narcotic|cocaine|heroin)/iu.test(quote)
      ? "A drug-related reference is explicitly present."
      : "No drug-related reference is explicit.",
  ];
  return Object.freeze(facts);
}

function compareCandidateSpan(
  left: { readonly text: string; readonly startOffset: number; readonly endOffset: number },
  right: { readonly text: string; readonly startOffset: number; readonly endOffset: number },
): number {
  const leftLength = Math.max(0, left.endOffset - left.startOffset);
  const rightLength = Math.max(0, right.endOffset - right.startOffset);
  if (leftLength !== rightLength) return leftLength - rightLength;
  if (left.startOffset !== right.startOffset) return left.startOffset - right.startOffset;
  if (left.endOffset !== right.endOffset) return left.endOffset - right.endOffset;
  return left.text.localeCompare(right.text);
}

function findPrimaryCandidateIndex(candidates: readonly { readonly text: string; readonly startOffset: number; readonly endOffset: number }[]): number {
  if (candidates.length === 0) return 0;
  let primaryIndex = 0;
  for (let index = 1; index < candidates.length; index++) {
    if (compareCandidateSpan(candidates[index]!, candidates[primaryIndex]!) < 0) {
      primaryIndex = index;
    }
  }
  return primaryIndex;
}

export function runEvidenceStage(chunk: V3PipelineChunk): LegalEvidenceResult {
  const raw = chunk.text;
  const sentenceCandidates = splitSentenceEvidenceCandidates(raw, chunk.startOffset, 0.9);
  const primaryIndex = findPrimaryCandidateIndex(sentenceCandidates);
  const primaryCandidate = sentenceCandidates[primaryIndex] ?? sentenceCandidates[0] ?? null;
  const quote = normalizeText(primaryCandidate?.text ?? raw.trim());
  const scene = extractTextMetadata(chunk.metadata, ["scene", "sceneTitle", "scene_name", "sceneName", "scene_id", "sceneId"]);
  const page = extractNumericMetadata(chunk.metadata, ["page", "pageNumber", "page_number"]);
  const evidenceType = detectDialogue(quote)
    ? "dialogue"
    : detectSceneDescription(quote)
      ? "scene_description"
      : scene || page !== null
        ? "story_context"
        : "unknown";
  const observedFacts = buildObservedFacts(quote, evidenceType);

  if (sentenceCandidates.length > 0) {
    return Object.freeze({
      candidates: sentenceCandidates,
      primaryCandidateIndex: primaryIndex,
      admissible: true,
      confidence: 0.9,
      quote,
      scene,
      page,
      evidenceType,
      observedFacts,
      notes: ["sentence_level_evidence_candidates"],
    });
  }

  return Object.freeze({
    candidates: [
      Object.freeze({
        text: raw.trim(),
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        confidence: 0.9,
        source: "chunk" as const,
        notes: [],
      }),
    ],
    primaryCandidateIndex: 0,
    admissible: true,
    confidence: 0.9,
    quote,
    scene,
    page,
    evidenceType,
    observedFacts,
    notes: isProfanityEvidenceText(raw) ? [] : ["no literal profanity detected"],
  });
}
