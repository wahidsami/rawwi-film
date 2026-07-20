import type { SceneAnalysisEvidenceSpan, SceneAnalysisState, SceneEvidencePageReference } from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function buildPageReferences(startOffset: number, endOffset: number): readonly SceneEvidencePageReference[] {
  return Object.freeze([
    Object.freeze({
      pageNumber: 1,
      startOffsetPage: startOffset,
      endOffsetPage: endOffset,
    }),
  ]);
}

function deriveEvidenceSpans(state: SceneAnalysisState): readonly SceneAnalysisEvidenceSpan[] {
  const sourceLines = state.sceneModel?.lines ?? [];
  const reviewableLines = sourceLines.filter((line) => line.lineType !== "heading" && line.lineType !== "transition");

  return Object.freeze(reviewableLines.map((line, index) => {
    const text = normalizeText(line.text);
    return Object.freeze({
      spanId: `evidence-${index + 1}`,
      text,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      lineId: line.lineId,
      sentenceIndex: index,
      sourceType: line.lineType === "dialogue" ? "dialogue" : line.lineType === "action" ? "scene_description" : "story_context",
      pageReferences: buildPageReferences(line.startOffset, line.endOffset),
      conceptIds: Object.freeze([]),
      confidence: 1,
      rationale: Object.freeze([
        "Verbatim screenplay line copied without rewriting.",
        "Smallest reviewable span selected from the scene model.",
      ]),
    });
  }));
}

export function createCandidateEvidenceNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const evidenceSpans = deriveEvidenceSpans(state);
    const primary = evidenceSpans[0] ?? null;

    return freezeSceneAnalysisState({
      ...state,
      evidenceSpans,
      primaryEvidenceSpanId: primary?.spanId ?? null,
      primaryEvidenceText: primary?.text ?? null,
      primaryEvidenceReason: primary ? "Smallest grounded screenplay span selected as evidence." : null,
    });
  };
}

