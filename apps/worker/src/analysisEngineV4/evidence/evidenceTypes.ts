export type EvidenceSourceType =
  | "Dialogue"
  | "Action"
  | "Description"
  | "Narration"
  | "Document"
  | "Sign"
  | "Screen"
  | "Media"
  | "VoiceOver"
  | "Phone"
  | "Message"
  | "SocialPost";

export type EvidencePageReference = Readonly<{
  pageNumber: number;
  startOffsetPage: number;
  endOffsetPage: number;
}>;

export type EvidenceGroundingMethod = "exact" | "normalized" | "compact" | "fallback";

export type EvidenceGrounding = Readonly<{
  sentenceId: string | null;
  lineId: string | null;
  page: number;
  startOffset: number;
  endOffset: number;
  byteStartOffset: number;
  byteEndOffset: number;
  matchedText: string;
  method: EvidenceGroundingMethod;
  pageReferences: readonly EvidencePageReference[];
}>;

export type EvidenceDedupDecision = Readonly<{
  keptEvidenceId: string;
  droppedEvidenceId: string;
  reason: string;
  matchedBy: "normalized_text" | "grounding_span" | "event_id";
}>;

export type Evidence = Readonly<{
  spanId: string;
  id: string;
  startOffset: number;
  endOffset: number;
  text: string;
  sceneId?: string;
  eventId?: string;
  speaker?: string | null;
  target?: string | null;
  page?: number;
  scene?: string;
  byteStartOffset?: number;
  byteEndOffset?: number;
  rawText?: string;
  normalizedText?: string;
  eventType?: string;
  participants?: readonly string[];
  confidence: number;
  sourceType: EvidenceSourceType | "dialogue" | "action" | "description" | "narration" | "document" | "sign" | "screen" | "media" | "voice_over" | "phone" | "message" | "social_post" | "scene_description" | "story_context" | "mixed";
  lineId: string | null;
  sentenceId?: string | null;
  sentenceIndex: number | null;
  pageReferences: readonly EvidencePageReference[];
  conceptIds: readonly string[];
  rationale: readonly string[];
  grounding?: EvidenceGrounding;
}>;

export type EvidenceCollection = Readonly<{
  sceneId: string;
  evidence: readonly Evidence[];
  primaryEvidenceId: string | null;
  dedupDecisions: readonly EvidenceDedupDecision[];
  grounding: Readonly<{
    totalCandidates: number;
    groundedCount: number;
    unmatchedCount: number;
  }>;
  executionTimeMs: number;
}>;

export type VerifiedEvidence = Readonly<{
  evidenceId: string;
  text: string;
  offsets: Readonly<{
    startOffset: number;
    endOffset: number;
  }>;
  page: number;
  scene: string;
}>;

function normalizeVerifiedEvidenceText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

export function createVerifiedEvidence(input: VerifiedEvidence): VerifiedEvidence {
  return Object.freeze({
    evidenceId: input.evidenceId,
    text: input.text,
    offsets: Object.freeze({
      startOffset: input.offsets.startOffset,
      endOffset: input.offsets.endOffset,
    }),
    page: input.page,
    scene: input.scene,
  });
}

export function createVerifiedEvidenceFromEvidence(evidence: Evidence): VerifiedEvidence {
  return createVerifiedEvidence({
    evidenceId: evidence.id,
    text: evidence.text ?? evidence.rawText ?? "",
    offsets: {
      startOffset: evidence.startOffset,
      endOffset: evidence.endOffset,
    },
    page: evidence.page ?? evidence.pageReferences[0]?.pageNumber ?? 1,
    scene: evidence.scene ?? evidence.text ?? evidence.rawText ?? "",
  });
}

export function createEvidenceFromVerifiedEvidence(sceneId: string, verifiedEvidence: VerifiedEvidence): Evidence {
  const text = verifiedEvidence.text;
  const startOffset = verifiedEvidence.offsets.startOffset;
  const endOffset = verifiedEvidence.offsets.endOffset;
  const pageReferences = Object.freeze([
    Object.freeze({
      pageNumber: verifiedEvidence.page,
      startOffsetPage: startOffset,
      endOffsetPage: endOffset,
    }),
  ]);

  return Object.freeze({
    spanId: verifiedEvidence.evidenceId,
    id: verifiedEvidence.evidenceId,
    startOffset,
    endOffset,
    text,
    sceneId,
    page: verifiedEvidence.page,
    scene: verifiedEvidence.scene,
    byteStartOffset: Buffer.byteLength(text.slice(0, startOffset), "utf8"),
    byteEndOffset: Buffer.byteLength(text.slice(0, endOffset), "utf8"),
    rawText: text,
    normalizedText: normalizeVerifiedEvidenceText(text),
    eventId: verifiedEvidence.evidenceId,
    eventType: "verified_evidence",
    lineId: null,
    sentenceIndex: 0,
    pageReferences,
    conceptIds: Object.freeze([]),
    rationale: Object.freeze(["Canonical verified evidence selected for downstream V4 processing."]),
    grounding: Object.freeze({
      sentenceId: verifiedEvidence.evidenceId,
      lineId: verifiedEvidence.evidenceId,
      page: verifiedEvidence.page,
      startOffset,
      endOffset,
      byteStartOffset: Buffer.byteLength(text.slice(0, startOffset), "utf8"),
      byteEndOffset: Buffer.byteLength(text.slice(0, endOffset), "utf8"),
      matchedText: text,
      method: "exact" as const,
      pageReferences,
    }),
    confidence: 1,
    sourceType: "Narration",
  });
}

export function createEvidenceCollectionFromVerifiedEvidence(sceneId: string, verifiedEvidence: VerifiedEvidence): EvidenceCollection {
  const evidence = createEvidenceFromVerifiedEvidence(sceneId, verifiedEvidence);
  return Object.freeze({
    sceneId,
    evidence: Object.freeze([evidence]),
    primaryEvidenceId: evidence.id,
    dedupDecisions: Object.freeze([]),
    grounding: Object.freeze({
      totalCandidates: 1,
      groundedCount: 1,
      unmatchedCount: 0,
    }),
    executionTimeMs: 0,
  });
}
