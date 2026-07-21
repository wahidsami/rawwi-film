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
