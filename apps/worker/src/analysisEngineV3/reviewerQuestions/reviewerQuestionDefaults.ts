import type { ReviewerQuestionSet } from "./reviewerQuestionTypes.js";

export const DEFAULT_REVIEWER_QUESTION_SET_ID = "v3_00_universal_questions_v1";

export const DEFAULT_REVIEWER_QUESTION_SET: ReviewerQuestionSet = Object.freeze({
  id: DEFAULT_REVIEWER_QUESTION_SET_ID,
  version: "1.0.0",
  title: "Default Reviewer Question Set",
  description: "Deterministic questions that frame reviewer reasoning before any subject-specific pack is consulted.",
  defaultQuestionIds: Object.freeze([
    "narrative-01",
    "speaker-01",
    "target-01",
    "intent-01",
    "context-01",
    "evidence-01",
    "concept-01",
    "confidence-01",
  ]),
  questions: Object.freeze([
    Object.freeze({
      id: "narrative-01",
      category: "Narrative Questions",
      purpose: "Determine the narrative mode before any legal or subject reasoning begins.",
      expectedAnswerFormat: "A short label such as dialogue, narration, scene description, documentary, news, fiction, dream, or flashback.",
      reasoningGuidance: "Read the local chunk literally and decide how the scene is being told before deciding what it means.",
      evidenceRequirements: Object.freeze([
        "Use only visible dialogue markers, narration markers, scene framing, or explicit narrative cues.",
        "Do not use legal conclusions or subject labels as evidence of narrative mode.",
      ]),
    }),
    Object.freeze({
      id: "speaker-01",
      category: "Speaker Questions",
      purpose: "Identify who is speaking when the chunk contains direct or reported speech.",
      expectedAnswerFormat: "A name, role, or the label unknown if the speaker cannot be supported by the text.",
      reasoningGuidance: "Prefer explicit cues in the chunk and preserve uncertainty when the speaker is not directly supported.",
      evidenceRequirements: Object.freeze([
        "A speaker cue in the chunk such as a colon, quote attribution, or reporting verb.",
        "A supporting local line that ties the utterance to the speaker.",
      ]),
    }),
    Object.freeze({
      id: "target-01",
      category: "Target Questions",
      purpose: "Identify who or what the statement is aimed at or about when the chunk supports a target.",
      expectedAnswerFormat: "A named target, a role label, or unknown.",
      reasoningGuidance: "Use direct address, referential wording, or scene context only when the target is explicitly supported.",
      evidenceRequirements: Object.freeze([
        "A direct address signal, descriptive reference, or explicit narrative context.",
        "No invented target when the chunk does not actually identify one.",
      ]),
    }),
    Object.freeze({
      id: "intent-01",
      category: "Intent Questions",
      purpose: "Determine whether the text is approving, condemning, warning, instructing, joking, or neutrally describing.",
      expectedAnswerFormat: "One label such as approval, condemnation, neutrality, instruction, warning, humor, or uncertainty.",
      reasoningGuidance: "Read tone, framing, and surrounding context before concluding intent.",
      evidenceRequirements: Object.freeze([
        "Textual cues that support intent such as condemnation words, praise words, or instructional framing.",
        "Context that does not contradict the stated intent.",
      ]),
    }),
    Object.freeze({
      id: "context-01",
      category: "Context Questions",
      purpose: "Decide whether education, documentary framing, history, fiction, satire, or role play changes interpretation.",
      expectedAnswerFormat: "A short context label or a note that context is ambiguous.",
      reasoningGuidance: "Prefer the strongest textual frame and preserve ambiguity when the text supports multiple contexts.",
      evidenceRequirements: Object.freeze([
        "Explicit scene framing, reporting language, story memory, or surrounding dialogue.",
        "Evidence that the frame is not merely assumed from the topic.",
      ]),
    }),
    Object.freeze({
      id: "evidence-01",
      category: "Evidence Questions",
      purpose: "Identify the literal evidence spans that the reviewer can rely on.",
      expectedAnswerFormat: "A concise evidence span description with exact local support.",
      reasoningGuidance: "Keep evidence narrow, literal, and anchored to the chunk before any inference.",
      evidenceRequirements: Object.freeze([
        "The exact words or a tightly bounded phrase from the local chunk.",
        "A boundary that remains inside the chunk and avoids invention.",
      ]),
    }),
    Object.freeze({
      id: "concept-01",
      category: "Concept Questions",
      purpose: "Check which canonical concepts are supported before subject packs are selected.",
      expectedAnswerFormat: "A list of canonical concept identifiers or an empty list when none are supported.",
      reasoningGuidance: "Only recognize concepts that are supported by the local evidence, semantic interpretation, or glossary references.",
      evidenceRequirements: Object.freeze([
        "A concrete local cue, semantic clue, or glossary link for each concept.",
        "No concept should be added only because it feels relevant.",
      ]),
    }),
    Object.freeze({
      id: "confidence-01",
      category: "Confidence Questions",
      purpose: "Calibrate reviewer confidence to the clarity of the local evidence.",
      expectedAnswerFormat: "A confidence level or score with a short explanation of why it is not higher or lower.",
      reasoningGuidance: "Lower confidence when cues conflict or the scene is ambiguous; raise confidence only when evidence is clear and consistent.",
      evidenceRequirements: Object.freeze([
        "Evidence clarity, contextual support, and exception strength.",
        "No inflated confidence when the text is ambiguous or contradictory.",
      ]),
    }),
  ]),
  notes: Object.freeze([
    "The question set is always rendered before the universal reviewer knowledge pack.",
    "The universal pack references this default question set by identifier.",
    "Questions guide reviewer reasoning; they do not decide legality by themselves.",
  ]),
});

