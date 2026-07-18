import type { LegalEvidenceResult } from "../legal/legalTypes.js";
import type { V3PipelineChunk } from "./pipelineTypes.js";
import { isProfanityEvidenceText } from "../legal/modules/profanity/profanityModule.js";
import { splitSentenceEvidenceCandidates } from "../evidence/evidenceCandidates.js";

function findFirstProfanitySpan(text: string): { start: number; end: number } | null {
  const candidates = [
    "العن أمك",
    "العن امك",
    "العن والديك",
    "يا حمار",
    "يا كلب",
    "يا خرا",
    "كس امة",
    "كس أمة",
    "يا نصاب",
    "يا حرامي",
    "يا كذاب",
    "عديم التربية",
    "يلعن",
    "العن",
    "لعنة",
    "تبا",
    "تبًا",
    "تباً",
    "خرا",
    "وسخ",
    "قذر",
    "حقير",
    "وضيع",
    "نذل",
    "خسيس",
    "لئيم",
    "جبان",
    "ساقط",
    "غبي",
    "أحمق",
    "سخيف",
    "كلب",
    "حمار",
    "أهبل",
    "اهبل",
    "كذاب",
    "حرامي",
    "نصاب",
    "نابي",
    "نابية",
    "شتيمة",
    "سباب",
    "قذف",
  ];
  const normalized = text.normalize("NFC");
  for (const term of candidates) {
    const idx = normalized.toLowerCase().indexOf(term.normalize("NFC").toLowerCase());
    if (idx >= 0) return { start: idx, end: idx + term.length };
  }
  return null;
}

export function runEvidenceStage(chunk: V3PipelineChunk): LegalEvidenceResult {
  const raw = chunk.text;
  const span = findFirstProfanitySpan(raw);

  if (span) {
    const text = raw.slice(span.start, span.end);
    return Object.freeze({
      candidates: [
        Object.freeze({
          text,
          startOffset: chunk.startOffset + span.start,
          endOffset: chunk.startOffset + span.end,
          confidence: 0.99,
          source: "chunk" as const,
          notes: [],
        }),
      ],
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.99,
      notes: [],
    });
  }

  const sentenceCandidates = splitSentenceEvidenceCandidates(raw, chunk.startOffset, 0.9);
  if (sentenceCandidates.length > 1) {
    return Object.freeze({
      candidates: sentenceCandidates,
      primaryCandidateIndex: 0,
      admissible: true,
      confidence: 0.9,
      notes: isProfanityEvidenceText(raw) ? [] : ["sentence_level_evidence_candidates"],
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
    notes: isProfanityEvidenceText(raw) ? [] : ["no literal profanity detected"],
  });
}
