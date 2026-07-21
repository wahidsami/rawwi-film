import type {
  Evidence,
  EvidenceCollection,
  EvidenceDedupDecision,
  EvidenceGrounding,
  EvidenceGroundingMethod,
  EvidencePageReference,
  EvidenceSourceType,
} from "./evidenceTypes.js";
import type { SemanticSceneEvent, SemanticSceneModel, SemanticSceneRelationship, SemanticSceneTimelineEntry, SceneAnalysisSentence, SceneAnalysisState, SceneModel } from "../sceneAnalysisState.js";
import { normalizeComparisonText, normalizeWhitespace, buildCompactText, inferSceneLabel, inferSourceType, inferSpeaker, inferTarget } from "./evidenceNormalizer.js";
import { scoreEvidenceCandidate, type EvidenceMatchKind } from "./evidenceScorer.js";

type EvidenceAnchorKind = "event" | "relationship" | "timeline" | "fallback";

type EvidenceAnchor = Readonly<{
  anchorKind: EvidenceAnchorKind;
  eventId: string;
  eventType: string;
  seedText: string;
  participants: readonly string[];
  speaker: string | null;
  target: string | null;
  anchorIndex: number;
}>;

type GroundedCandidate = Readonly<{
  anchor: EvidenceAnchor;
  sentence: SceneAnalysisSentence;
  groundedText: string;
  startOffset: number;
  endOffset: number;
  byteStartOffset: number;
  byteEndOffset: number;
  matchKind: EvidenceMatchKind;
  sourceType: EvidenceSourceType;
  confidence: number;
  lineId: string | null;
  sentenceId: string | null;
  pageReferences: readonly EvidencePageReference[];
}>;

type BuiltEvidence = Readonly<{
  evidence: Evidence;
  candidate: GroundedCandidate;
}>;

function normalizeCandidateText(value: string): string {
  return normalizeWhitespace(value);
}

function stripSurroundingQuotes(value: string): string {
  return value.replace(/^[\s"'«»“”‘’]+|[\s"'«»“”‘’]+$/gu, "").trim();
}

function shrinkCandidateText(seedText: string, sourceType: EvidenceSourceType): string {
  let candidate = normalizeCandidateText(seedText);

  if (candidate.includes(":")) {
    const [, afterColon] = candidate.split(/:\s*/u, 2);
    if (afterColon && afterColon.trim().length > 0) {
      candidate = afterColon.trim();
    }
  }

  candidate = stripSurroundingQuotes(candidate);

  if ((sourceType === "Dialogue" || sourceType === "VoiceOver" || sourceType === "Message" || sourceType === "Phone" || sourceType === "SocialPost") && candidate.startsWith("-")) {
    candidate = candidate.replace(/^\s*[-–—]+\s*/u, "").trim();
  }

  return candidate.length > 0 ? candidate : normalizeCandidateText(seedText);
}

function toByteOffset(text: string, charOffset: number): number {
  return Buffer.byteLength(text.slice(0, charOffset), "utf8");
}

function buildPageReferences(startOffset: number, endOffset: number): readonly EvidencePageReference[] {
  return Object.freeze([
    Object.freeze({
      pageNumber: 1,
      startOffsetPage: startOffset,
      endOffsetPage: endOffset,
    }),
  ]);
}

function sentenceSourceType(sentence: SceneAnalysisSentence): EvidenceSourceType {
  if (sentence.sourceType === "dialogue") {
    return "Dialogue";
  }
  if (sentence.sourceType === "scene_description") {
    return inferSourceType(sentence.text, "Action");
  }
  return inferSourceType(sentence.text, "Narration");
}

function buildAnchors(semanticSceneModel: SemanticSceneModel): readonly EvidenceAnchor[] {
  const anchors: EvidenceAnchor[] = [];

  for (const [index, event] of semanticSceneModel.events.entries()) {
    const participants = Object.freeze([...event.participants]);
    anchors.push(Object.freeze({
      anchorKind: "event",
      eventId: `event-${index + 1}`,
      eventType: normalizeCandidateText(event.eventType || "Scene Observation"),
      seedText: normalizeCandidateText(event.evidence || event.description || semanticSceneModel.summary),
      participants,
      speaker: participants[0] ?? null,
      target: inferTarget(participants),
      anchorIndex: index,
    }));
  }

  for (const [index, relationship] of semanticSceneModel.relationships.entries()) {
    const participants = Object.freeze([relationship.subject, relationship.object].filter((value): value is string => Boolean(value)));
    anchors.push(Object.freeze({
      anchorKind: "relationship",
      eventId: `relationship-${index + 1}`,
      eventType: "Relationship",
      seedText: normalizeCandidateText(relationship.evidence ?? `${relationship.subject} ${relationship.relation} ${relationship.object}`),
      participants,
      speaker: participants[0] ?? null,
      target: inferTarget(participants),
      anchorIndex: index,
    }));
  }

  for (const [index, entry] of semanticSceneModel.timeline.entries()) {
    anchors.push(Object.freeze({
      anchorKind: "timeline",
      eventId: `timeline-${index + 1}`,
      eventType: "Timeline",
      seedText: normalizeCandidateText(entry.evidence ?? entry.description),
      participants: Object.freeze([]),
      speaker: null,
      target: null,
      anchorIndex: index,
    }));
  }

  if (anchors.length === 0) {
    anchors.push(Object.freeze({
      anchorKind: "fallback",
      eventId: "fallback-1",
      eventType: "Fallback",
      seedText: normalizeCandidateText(semanticSceneModel.summary),
      participants: Object.freeze([]),
      speaker: null,
      target: null,
      anchorIndex: 0,
    }));
  }

  return Object.freeze(anchors);
}

function compactMatch(sentence: SceneAnalysisSentence, candidateText: string): { startOffset: number; endOffset: number; matchedText: string; matchKind: EvidenceMatchKind } | null {
  const sentenceText = sentence.text;
  const normalizedSentence = normalizeComparisonText(sentenceText);
  const normalizedCandidate = normalizeComparisonText(candidateText);
  if (normalizedCandidate.length === 0) {
    return null;
  }

  const exactIndex = sentenceText.indexOf(candidateText);
  if (exactIndex >= 0) {
    const startOffset = sentence.startOffset + exactIndex;
    const endOffset = startOffset + candidateText.length;
    return {
      startOffset,
      endOffset,
      matchedText: sentenceText.slice(exactIndex, exactIndex + candidateText.length),
      matchKind: "exact",
    };
  }

  if (normalizedSentence.includes(normalizedCandidate)) {
    const compactSentence = buildCompactText(sentenceText);
    const compactCandidate = buildCompactText(candidateText);
    const compactIndex = compactSentence.compact.indexOf(compactCandidate.compact);
    if (compactIndex >= 0) {
      const compactStart = compactSentence.map[compactIndex];
      const compactEnd = compactSentence.map[compactIndex + compactCandidate.compact.length - 1];
      if (compactStart !== undefined && compactEnd !== undefined) {
        const rawStart = sentence.startOffset + compactStart;
        const rawEnd = sentence.startOffset + compactEnd + 1;
        return {
          startOffset: rawStart,
          endOffset: rawEnd,
          matchedText: sentenceText.slice(compactStart, compactEnd + 1),
          matchKind: "compact",
        };
      }
    }
  }

  return null;
}

function computeByteOffsets(sceneText: string, startOffset: number, endOffset: number): Readonly<{ byteStartOffset: number; byteEndOffset: number }> {
  return Object.freeze({
    byteStartOffset: toByteOffset(sceneText, startOffset),
    byteEndOffset: toByteOffset(sceneText, endOffset),
  });
}

function groundAnchorToSentence(
  sceneModel: SceneModel,
  anchor: EvidenceAnchor,
  sentence: SceneAnalysisSentence,
): GroundedCandidate | null {
  const candidateText = shrinkCandidateText(anchor.seedText, sentenceSourceType(sentence));
  if (candidateText.length === 0) {
    return null;
  }

  const match = compactMatch(sentence, candidateText);
  if (!match) {
    return null;
  }

  const sourceType = sentenceSourceType(sentence);
  const confidence = scoreEvidenceCandidate({
    matchKind: match.matchKind,
    sourceType,
    anchorKind: anchor.anchorKind,
    candidateText,
    matchedText: match.matchedText,
    spanLength: Math.max(0, match.endOffset - match.startOffset),
    participants: anchor.participants,
  });
  const byteOffsets = computeByteOffsets(sceneModel.rawSceneText, match.startOffset, match.endOffset);

  return Object.freeze({
    anchor,
    sentence,
    groundedText: sentence.text.slice(Math.max(0, match.startOffset - sentence.startOffset), Math.max(0, match.endOffset - sentence.startOffset)),
    startOffset: match.startOffset,
    endOffset: match.endOffset,
    byteStartOffset: byteOffsets.byteStartOffset,
    byteEndOffset: byteOffsets.byteEndOffset,
    matchKind: match.matchKind,
    sourceType,
    confidence,
    lineId: sentence.sentenceId,
    sentenceId: sentence.sentenceId,
    pageReferences: buildPageReferences(match.startOffset, match.endOffset),
  });
}

function groundAnchor(sceneModel: SceneModel, anchor: EvidenceAnchor): GroundedCandidate | null {
  const orderedSentences = [...sceneModel.sentences].sort((left, right) => left.startOffset - right.startOffset || left.sentenceId.localeCompare(right.sentenceId));
  const matches = orderedSentences
    .map((sentence) => groundAnchorToSentence(sceneModel, anchor, sentence))
    .filter((value): value is GroundedCandidate => value !== null);

  if (matches.length === 0) {
    return null;
  }

  return matches.sort((left, right) => {
    const leftLength = left.endOffset - left.startOffset;
    const rightLength = right.endOffset - right.startOffset;
    if (leftLength !== rightLength) {
      return leftLength - rightLength;
    }
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }
    return left.startOffset - right.startOffset;
  })[0] ?? null;
}

function buildEvidenceFromGrounding(sceneModel: SceneModel, semanticSceneModel: SemanticSceneModel, grounded: GroundedCandidate, index: number): Evidence {
  const rawText = grounded.sentence.text.slice(grounded.startOffset - grounded.sentence.startOffset, grounded.endOffset - grounded.sentence.startOffset);
  const normalizedText = normalizeComparisonText(rawText);
  const participants = Object.freeze([...grounded.anchor.participants].map((value) => normalizeWhitespace(value)).filter(Boolean).sort((left, right) => left.localeCompare(right)));
  const speaker = grounded.anchor.speaker ? normalizeWhitespace(grounded.anchor.speaker) : inferSpeaker(grounded.sentence.text);
  const target = grounded.anchor.target ? normalizeWhitespace(grounded.anchor.target) : inferTarget(participants);
  const page = 1;
  const sceneLabel = inferSceneLabel(semanticSceneModel.summary, sceneModel.heading.raw);
  const sourceType = grounded.sourceType;

  return Object.freeze({
    spanId: `evidence-${index + 1}`,
    id: `evidence-${index + 1}`,
    sceneId: sceneModel.sceneId,
    eventId: grounded.anchor.eventId,
    speaker,
    target,
    page,
    scene: sceneLabel,
    startOffset: grounded.startOffset,
    endOffset: grounded.endOffset,
    byteStartOffset: grounded.byteStartOffset,
    byteEndOffset: grounded.byteEndOffset,
    rawText,
    normalizedText,
    text: rawText,
    eventType: grounded.anchor.eventType,
    participants,
    confidence: grounded.confidence,
    sourceType,
    lineId: grounded.lineId,
    sentenceId: grounded.sentenceId,
    sentenceIndex: grounded.sentence?.sentenceId ? Number(grounded.sentence.sentenceId.replace(/^sentence-/u, "")) - 1 : null,
    pageReferences: grounded.pageReferences,
    conceptIds: Object.freeze([]),
    rationale: Object.freeze([
      `Grounded from ${grounded.anchor.anchorKind} anchor ${grounded.anchor.eventId}.`,
      `Matched text: ${rawText}`,
      `Source type: ${sourceType}.`,
    ]),
    grounding: Object.freeze({
      sentenceId: grounded.sentenceId,
      lineId: grounded.lineId,
      page,
      startOffset: grounded.startOffset,
      endOffset: grounded.endOffset,
      byteStartOffset: grounded.byteStartOffset,
      byteEndOffset: grounded.byteEndOffset,
      matchedText: rawText,
      method: grounded.matchKind as EvidenceGroundingMethod,
      pageReferences: grounded.pageReferences,
    }),
  });
}

function deduplicateEvidence(evidence: readonly Evidence[]): Readonly<{
  evidence: readonly Evidence[];
  dedupDecisions: readonly EvidenceDedupDecision[];
}> {
  const deduped: Evidence[] = [];
  const decisions: EvidenceDedupDecision[] = [];
  const seen = new Map<string, Evidence>();

  for (const candidate of evidence) {
    const key = [
      candidate.sceneId ?? "",
      candidate.normalizedText ?? normalizeComparisonText(candidate.text),
      candidate.startOffset,
      candidate.endOffset,
      candidate.sourceType,
    ].join("|");
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, candidate);
      deduped.push(candidate);
      continue;
    }

    const winner = existing.confidence >= candidate.confidence ? existing : candidate;
    const dropped = winner === existing ? candidate : existing;
    if (winner !== existing) {
      const index = deduped.findIndex((item) => item.id === existing.id);
      if (index >= 0) {
        deduped[index] = winner;
      }
      seen.set(key, winner);
    }

    decisions.push(Object.freeze({
      keptEvidenceId: winner.id,
      droppedEvidenceId: dropped.id,
      reason: `Merged duplicate evidence using normalized text "${candidate.normalizedText}".`,
      matchedBy: "normalized_text",
    }));
  }

  return Object.freeze({
    evidence: Object.freeze([...deduped].sort((left, right) => left.startOffset - right.startOffset || left.id.localeCompare(right.id))),
    dedupDecisions: Object.freeze(decisions),
  });
}

export function buildEvidenceCollection(state: SceneAnalysisState): EvidenceCollection {
  const startedAt = globalThis.performance?.now?.() ?? Date.now();
  const semanticSceneModel = state.semanticSceneModel;
  const sceneModel = state.sceneModel;

  if (!semanticSceneModel || !sceneModel) {
    return Object.freeze({
      sceneId: state.sceneId,
      evidence: Object.freeze([]),
      primaryEvidenceId: null,
      dedupDecisions: Object.freeze([]),
      grounding: Object.freeze({
        totalCandidates: 0,
        groundedCount: 0,
        unmatchedCount: 0,
      }),
      executionTimeMs: 0,
    });
  }

  const anchors = buildAnchors(semanticSceneModel);
  const grounded = anchors
    .map((anchor) => groundAnchor(sceneModel, anchor))
    .filter((value): value is GroundedCandidate => value !== null);
  const built = grounded.map((candidate, index) => buildEvidenceFromGrounding(sceneModel, semanticSceneModel, candidate, index));
  const deduplicated = deduplicateEvidence(built);
  const primaryEvidence = deduplicated.evidence[0] ?? null;
  const finishedAt = globalThis.performance?.now?.() ?? Date.now();

  return Object.freeze({
    sceneId: state.sceneId,
    evidence: deduplicated.evidence,
    primaryEvidenceId: primaryEvidence?.id ?? null,
    dedupDecisions: deduplicated.dedupDecisions,
    grounding: Object.freeze({
      totalCandidates: anchors.length,
      groundedCount: grounded.length,
      unmatchedCount: Math.max(0, anchors.length - grounded.length),
    }),
    executionTimeMs: Math.max(0, finishedAt - startedAt),
  });
}
