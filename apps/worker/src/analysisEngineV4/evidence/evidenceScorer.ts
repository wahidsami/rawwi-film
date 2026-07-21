import type { EvidenceSourceType } from "./evidenceTypes.js";
import { normalizeComparisonText } from "./evidenceNormalizer.js";

export type EvidenceMatchKind = "exact" | "normalized" | "compact" | "fallback";

export type EvidenceScoreInput = Readonly<{
  matchKind: EvidenceMatchKind;
  sourceType: EvidenceSourceType;
  anchorKind: "event" | "relationship" | "timeline" | "fallback";
  candidateText: string;
  matchedText: string;
  spanLength: number;
  participants: readonly string[];
}>;

function clampConfidence(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(6));
}

export function scoreEvidenceCandidate(input: EvidenceScoreInput): number {
  const matchScore: Record<EvidenceMatchKind, number> = {
    exact: 0.98,
    normalized: 0.94,
    compact: 0.9,
    fallback: 0.76,
  };

  const sourceBonus: Partial<Record<EvidenceSourceType, number>> = {
    Dialogue: 0.03,
    Action: 0.03,
    Description: 0.02,
    Narration: 0.02,
    Document: 0.02,
    Sign: 0.02,
    Screen: 0.02,
    Media: 0.02,
    VoiceOver: 0.02,
    Phone: 0.02,
    Message: 0.02,
    SocialPost: 0.02,
  };

  const anchorBonus: Record<EvidenceScoreInput["anchorKind"], number> = {
    event: 0.04,
    relationship: 0.025,
    timeline: 0.015,
    fallback: 0,
  };

  const candidateLengthBonus = input.matchedText.length > 0
    ? Math.min(0.04, 1 / Math.max(12, input.matchedText.length))
    : 0;
  const participantBonus = input.participants.length > 0 ? Math.min(0.03, input.participants.length * 0.005) : 0;
  const compactPenalty = input.matchKind === "fallback" ? 0.08 : 0;
  const domainShapeBonus = normalizeComparisonText(input.candidateText).length > 0 ? 0.01 : 0;

  return clampConfidence(
    matchScore[input.matchKind]
    + (sourceBonus[input.sourceType] ?? 0)
    + anchorBonus[input.anchorKind]
    + candidateLengthBonus
    + participantBonus
    + domainShapeBonus
    - compactPenalty,
  );
}

