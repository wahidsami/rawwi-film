import type { ConceptContext } from "../concepts/conceptTypes.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createKnowledgeRegistryWithOptions, type KnowledgeRegistry } from "./knowledgeRegistry/index.js";
import { createDefaultReviewerKnowledgeRegistry, type ReviewerKnowledgeRegistry } from "./reviewerKnowledgeRegistry.js";

type ReviewerRoutingProfile = Readonly<{
  reviewerId: string;
  packId: string;
  folder: string;
  label: string;
  conceptIds: readonly string[];
  keywords: readonly string[];
  entityTerms: readonly string[];
  priority: number;
}>;

type ReviewerRoutingScore = Readonly<{
  reviewerId: string;
  packId: string;
  folder: string;
  label: string;
  score: number;
  confidence: number;
  reasons: readonly string[];
}>;

export type EmergencyContextualReviewerRoutingReport = Readonly<{
  selectedReviewerIds: readonly string[];
  selectedReviewerLabels: readonly string[];
  selectedReviewerPackIds: readonly string[];
  selectedAcademyFolders: readonly string[];
  rejectedReviewerIds: readonly string[];
  rejectedReviewerLabels: readonly string[];
  loadedAcademyCount: number;
  skippedAcademyCount: number;
  knowledgeReductionPercent: number;
  routingConfidence: number;
  routingReason: string;
  lowConfidence: boolean;
  reviewerScores: readonly ReviewerRoutingScore[];
}>;

export type EmergencyContextualReviewerKnowledgeSelection = Readonly<{
  routing: EmergencyContextualReviewerRoutingReport;
  reviewerKnowledgeRegistry: ReviewerKnowledgeRegistry;
  knowledgeRegistry: KnowledgeRegistry;
}>;

const UNIVERSAL_PROFILE: ReviewerRoutingProfile = Object.freeze({
  reviewerId: "v3_00_universal",
  packId: "v3_00_universal",
  folder: "universal",
  label: "Universal GCAM Guidance",
  conceptIds: Object.freeze([
    "dialogue",
    "narration",
    "speaker",
    "listener",
    "target",
    "victim",
    "quotation",
    "reported_speech",
    "educational_context",
    "documentary_context",
    "historical_context",
    "fictional_context",
    "satire",
    "irony",
    "metaphor",
    "symbolic_language",
    "role_play",
    "dream",
    "flashback",
    "hallucination",
    "encouragement",
    "condemnation",
    "praise",
    "criticism",
    "neutral_reference",
    "evidence_strength",
    "confidence_calibration",
    "ambiguity_handling",
    "multi_speaker_conversation",
    "conflicting_evidence",
    "reviewer_confidence",
  ]),
  keywords: Object.freeze([
    "dialogue",
    "narration",
    "speaker",
    "listener",
    "target",
    "victim",
    "quotation",
    "reported speech",
    "educational context",
    "documentary context",
    "historical context",
    "fictional context",
    "satire",
    "irony",
    "metaphor",
    "symbolic language",
    "role play",
    "dream",
    "flashback",
    "hallucination",
    "condemnation",
    "praise",
    "criticism",
    "neutral reference",
    "confidence calibration",
    "ambiguity",
  ]),
  entityTerms: Object.freeze(["speaker", "listener", "target", "victim"]),
  priority: 0,
});

const REVIEWER_ROUTING_PROFILES: readonly ReviewerRoutingProfile[] = Object.freeze([
  UNIVERSAL_PROFILE,
  Object.freeze({
    reviewerId: "v4_11_profanity",
    packId: "v4_11_profanity",
    folder: "profanity",
    label: "Profanity Reviewer",
    conceptIds: Object.freeze(["profanity", "insult", "abuse", "swear", "abusive_language"]),
    keywords: Object.freeze([
      "profanity",
      "insult",
      "abusive language",
      "swear",
      "curse",
      "يا كلب",
      "يا حمار",
      "يا خرا",
      "كس امة",
      "كس أمة",
      "لعنة",
      "سباب",
      "شتيمة",
    ]),
    entityTerms: Object.freeze(["curse", "swear", "insult"]),
    priority: 1,
  }),
  Object.freeze({
    reviewerId: "v3_05_society",
    packId: "v3_05_society",
    folder: "society",
    label: "Society Reviewer",
    conceptIds: Object.freeze([
      "society_family_values",
      "society_family_breakdown",
      "society_family_respect",
      "society_parents",
      "society_mother",
      "society_father",
      "society_children",
      "society_domestic_abuse",
      "society_neglect",
      "society_bullying",
      "society_harassment",
      "society_discrimination",
      "society_racism",
      "society_tribalism",
      "society_humiliation",
      "society_insult",
      "society_mockery",
      "society_hate",
      "society_public_decency",
    ]),
    keywords: Object.freeze([
      "family",
      "parent",
      "mother",
      "father",
      "children",
      "bullying",
      "harassment",
      "discrimination",
      "racism",
      "tribal",
      "humiliation",
      "insult",
      "mockery",
      "hate",
      "public decency",
      "abuse",
      "neglect",
    ]),
    entityTerms: Object.freeze(["family", "parent", "mother", "father", "child", "children"]),
    priority: 2,
  }),
  Object.freeze({
    reviewerId: "v3_05_children",
    packId: "v3_05_children",
    folder: "children",
    label: "Children Reviewer",
    conceptIds: Object.freeze([
      "children",
      "child_harm",
      "age_rating",
      "vulnerable_person",
      "child_abuse",
      "child_recruitment",
      "bullying",
      "criminal_exploitation",
      "elderly_person",
      "fear_induction",
      "psychological_abuse",
      "sexual_exploitation",
      "threatening",
      "disabled_adult",
      "neglect",
      "grooming",
      "trafficking",
      "disability_abuse",
    ]),
    keywords: Object.freeze([
      "child",
      "children",
      "minor",
      "kid",
      "grooming",
      "abuse",
      "neglect",
      "exploitation",
      "trafficking",
      "vulnerable",
      "disabled",
      "parent",
      "guardian",
    ]),
    entityTerms: Object.freeze(["child", "children", "minor", "kid", "parent", "guardian"]),
    priority: 3,
  }),
  Object.freeze({
    reviewerId: "v3_03_security",
    packId: "v3_03_security",
    folder: "security",
    label: "National Security Reviewer",
    conceptIds: Object.freeze([
      "government",
      "military",
      "organized_crime",
      "terrorism",
      "violence",
      "extremism",
      "public_order",
      "national_unity",
      "state_institutions",
      "police",
      "weapons",
      "riots",
    ]),
    keywords: Object.freeze([
      "terrorism",
      "extremism",
      "public order",
      "riot",
      "riots",
      "weapons",
      "military",
      "government",
      "police",
      "state",
      "overthrow",
      "sabotage",
      "disorder",
      "incitement",
    ]),
    entityTerms: Object.freeze(["government", "military", "police", "state"]),
    priority: 4,
  }),
  Object.freeze({
    reviewerId: "v3_08_violence",
    packId: "v3_08_violence",
    folder: "violence",
    label: "Violence Reviewer",
    conceptIds: Object.freeze(["domestic_violence", "torture", "murder", "graphic_violence", "weapons", "self_defense", "condemned_violence", "documentary_violence"]),
    keywords: Object.freeze(["violence", "murder", "torture", "graphic", "weapons", "self-defense", "self defense", "domestic violence", "kill", "beat"]),
    entityTerms: Object.freeze(["violence", "murder", "torture", "weapons"]),
    priority: 5,
  }),
  Object.freeze({
    reviewerId: "v3_07_sexuality",
    packId: "v3_07_sexuality",
    folder: "sexuality",
    label: "Sexual Content Reviewer",
    conceptIds: Object.freeze(["nudity", "explicit", "sexual_reference", "sexual_content", "intimate_content", "medical_context", "artistic_context"]),
    keywords: Object.freeze(["sexual", "nudity", "explicit", "intimate", "medical", "artistic", "intercourse", "pornography"]),
    entityTerms: Object.freeze(["nudity", "sexual", "intimate", "porn"]),
    priority: 6,
  }),
  Object.freeze({
    reviewerId: "v3_12_drugs",
    packId: "v3_12_drugs",
    folder: "drugs",
    label: "Drugs Reviewer",
    conceptIds: Object.freeze(["manufacture", "trafficking", "use", "promotion", "rehabilitation", "medical_context", "drugs"]),
    keywords: Object.freeze(["drugs", "drug", "manufacture", "trafficking", "rehabilitation", "medical", "promotion", "use"]),
    entityTerms: Object.freeze(["drugs", "drug", "trafficking"]),
    priority: 7,
  }),
  Object.freeze({
    reviewerId: "v3_01_religion",
    packId: "v3_01_religion",
    folder: "religion",
    label: "Religion Reviewer",
    conceptIds: Object.freeze(["religion", "religious", "blasphemy", "sacrilege", "faith", "holy"]),
    keywords: Object.freeze(["religion", "religious", "blasphemy", "sacrilege", "faith", "god", "prophet", "mosque", "church"]),
    entityTerms: Object.freeze(["religion", "god", "prophet"]),
    priority: 8,
  }),
  Object.freeze({
    reviewerId: "v3_04_politics",
    packId: "v3_04_politics",
    folder: "politics",
    label: "Politics Reviewer",
    conceptIds: Object.freeze(["politics", "political", "government", "election", "state", "authority", "regime", "leader"]),
    keywords: Object.freeze(["politics", "political", "government", "election", "state", "authority", "regime", "leader", "leadership"]),
    entityTerms: Object.freeze(["government", "state", "leader"]),
    priority: 9,
  }),
  Object.freeze({
    reviewerId: "v3_09_crime",
    packId: "v3_09_crime",
    folder: "crime",
    label: "Crime Reviewer",
    conceptIds: Object.freeze(["crime", "theft", "fraud", "murder", "assault", "extortion", "bribe", "organized_crime", "cybercrime"]),
    keywords: Object.freeze(["crime", "theft", "fraud", "murder", "assault", "extortion", "bribe", "cybercrime", "organized crime"]),
    entityTerms: Object.freeze(["crime", "fraud", "theft"]),
    priority: 10,
  }),
  Object.freeze({
    reviewerId: "v3_04_history",
    packId: "v3_04_history",
    folder: "history",
    label: "History Reviewer",
    conceptIds: Object.freeze(["history", "historical", "documentary", "fabricated_history", "historical_distortion", "false_documentary_claims"]),
    keywords: Object.freeze(["history", "historical", "documentary", "fabricated", "distortion", "quotation", "claims"]),
    entityTerms: Object.freeze(["history", "historical", "documentary"]),
    priority: 11,
  }),
  Object.freeze({
    reviewerId: "v3_13_travel",
    packId: "v3_13_travel",
    folder: "travel",
    label: "Travel Reviewer",
    conceptIds: Object.freeze(["travel", "journey", "tourism", "airport", "visa", "passport", "hotel"]),
    keywords: Object.freeze(["travel", "journey", "tourism", "airport", "visa", "passport", "hotel"]),
    entityTerms: Object.freeze(["travel", "airport", "visa"]),
    priority: 12,
  }),
]);

function normalizeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase() : "";
}

function collectSignals(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>): readonly string[] {
  const promptInput = input.promptInput;
  const assessment = input.assessment;
  const conceptContext = input.conceptContext;

  const textSignals = [
    promptInput.chunkContext.localChunk,
    assessment.narrativeUnderstanding,
    assessment.narrativeIntent,
    assessment.contextClassification,
    assessment.literalVsImpliedMeaning,
    assessment.speaker ?? "",
    assessment.target ?? "",
    assessment.victim ?? "",
    conceptContext.primaryConceptId ?? "",
    ...(conceptContext.conceptIds ?? []),
    ...(conceptContext.concepts ?? []).flatMap((concept) => [
      concept.id,
      concept.label,
      ...(concept.originatingSentences ?? []),
      ...(concept.entityReferences ?? []),
      ...(concept.glossaryReferences ?? []),
      ...(concept.evidenceSources ?? []).flatMap((source) => [
        source.sourceText,
        source.originatingSentence ?? "",
        source.glossaryTerm ?? "",
        source.entityId ?? "",
      ]),
    ]),
  ];

  return Object.freeze(
    [...new Set(textSignals.map((value) => normalizeText(value)).filter((value) => value.length > 0))].sort((left, right) => left.localeCompare(right)),
  );
}

function countMatches(corpus: readonly string[], terms: readonly string[]): { count: number; matchedTerms: readonly string[] } {
  const matched = new Set<string>();
  const joined = corpus.join(" | ");
  for (const term of terms) {
    const normalized = normalizeText(term);
    if (!normalized) continue;
    if (joined.includes(normalized)) {
      matched.add(normalized);
    }
  }
  return {
    count: matched.size,
    matchedTerms: Object.freeze([...matched].sort((left, right) => left.localeCompare(right))),
  };
}

function scoreProfile(profile: ReviewerRoutingProfile, signals: readonly string[]): ReviewerRoutingScore {
  const conceptMatch = countMatches(signals, profile.conceptIds);
  const keywordMatch = countMatches(signals, profile.keywords);
  const entityMatch = countMatches(signals, profile.entityTerms);

  const score = Math.min(1, Number((
    (conceptMatch.count * 0.45) +
    (keywordMatch.count * 0.35) +
    (entityMatch.count * 0.2)
  ).toFixed(6)));

  const reasons = [
    ...(conceptMatch.matchedTerms.length > 0 ? [`concepts:${conceptMatch.matchedTerms.join(",")}`] : []),
    ...(keywordMatch.matchedTerms.length > 0 ? [`keywords:${keywordMatch.matchedTerms.join(",")}`] : []),
    ...(entityMatch.matchedTerms.length > 0 ? [`entities:${entityMatch.matchedTerms.join(",")}`] : []),
  ];

  return Object.freeze({
    reviewerId: profile.reviewerId,
    packId: profile.packId,
    folder: profile.folder,
    label: profile.label,
    score,
    confidence: score,
    reasons: Object.freeze(reasons),
  });
}

function selectedCountFromScores(scores: readonly ReviewerRoutingScore[]): number {
  const subjectScores = scores.filter((score) => score.reviewerId !== UNIVERSAL_PROFILE.reviewerId);
  if (subjectScores.length === 0) return 0;
  const first = subjectScores[0] ?? null;
  const second = subjectScores[1] ?? null;
  if (!first) return 0;
  const lowConfidence = first.score < 0.55 || (second !== null && (first.score - second.score) < 0.15);
  return lowConfidence ? Math.min(2, subjectScores.length) : 1;
}

function buildRoutingReason(selected: readonly ReviewerRoutingScore[], lowConfidence: boolean, signals: readonly string[]): string {
  const top = selected[0] ?? null;
  if (!top) {
    return "No reviewer-specific signal was strong enough; defaulting to universal guidance and the highest-priority reviewers.";
  }

  const primaryReason = top.reasons.length > 0 ? top.reasons.join(" | ") : "priority fallback";
  const signalPreview = signals.slice(0, 4).join(" | ");
  return lowConfidence
    ? `Low routing confidence (${top.score.toFixed(3)}); loading top 2 reviewers. Primary match: ${top.label} via ${primaryReason}. Signals: ${signalPreview}`
    : `High routing confidence (${top.score.toFixed(3)}); loading ${top.label}. Primary match: ${primaryReason}. Signals: ${signalPreview}`;
}

export function createEmergencyContextualReviewerRoutingReport(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>): EmergencyContextualReviewerRoutingReport {
  const signals = collectSignals(input);
  const scored = REVIEWER_ROUTING_PROFILES
    .filter((profile) => profile.reviewerId !== UNIVERSAL_PROFILE.reviewerId)
    .map((profile) => scoreProfile(profile, signals))
    .sort((left, right) => right.score - left.score || left.reviewerId.localeCompare(right.reviewerId) || left.packId.localeCompare(right.packId));

  const selectedSubjectCount = selectedCountFromScores(scored);
  const selectedSubjectReviewers = scored.slice(0, selectedSubjectCount);
  const lowConfidence = selectedSubjectCount > 1;
  const selectedReviewerIds = Object.freeze(selectedSubjectReviewers.map((reviewer) => reviewer.reviewerId));
  const selectedReviewerLabels = Object.freeze(selectedSubjectReviewers.map((reviewer) => reviewer.label));
  const selectedReviewerPackIds = Object.freeze([UNIVERSAL_PROFILE.packId, ...selectedSubjectReviewers.map((reviewer) => reviewer.packId)]);
  const selectedAcademyFolders = Object.freeze([UNIVERSAL_PROFILE.folder, ...selectedSubjectReviewers.map((reviewer) => reviewer.folder)]);
  const rejectedSubjectReviewers = scored.slice(selectedSubjectCount);
  const rejectedReviewerIds = Object.freeze(rejectedSubjectReviewers.map((reviewer) => reviewer.reviewerId));
  const rejectedReviewerLabels = Object.freeze(rejectedSubjectReviewers.map((reviewer) => reviewer.label));
  const routingConfidence = selectedSubjectReviewers.length === 0
    ? 0
    : Number((lowConfidence
      ? selectedSubjectReviewers.slice(0, 2).reduce((total, reviewer) => total + reviewer.score, 0) / Math.min(2, selectedSubjectReviewers.length)
      : selectedSubjectReviewers[0]?.score ?? 0).toFixed(6));

  const totalReviewerCount = REVIEWER_ROUTING_PROFILES.length;
  const loadedAcademyCount = selectedAcademyFolders.length;
  const skippedAcademyCount = Math.max(0, totalReviewerCount - loadedAcademyCount);
  const knowledgeReductionPercent = totalReviewerCount === 0
    ? 0
    : Number(((skippedAcademyCount / totalReviewerCount) * 100).toFixed(2));
  const routingReason = buildRoutingReason(selectedSubjectReviewers, lowConfidence, signals);

  return Object.freeze({
    selectedReviewerIds,
    selectedReviewerLabels,
    selectedReviewerPackIds,
    selectedAcademyFolders,
    rejectedReviewerIds,
    rejectedReviewerLabels,
    loadedAcademyCount,
    skippedAcademyCount,
    knowledgeReductionPercent,
    routingConfidence,
    routingReason,
    lowConfidence,
    reviewerScores: Object.freeze([
      ...scored,
    ]),
  });
}

export function createEmergencyContextualReviewerKnowledgeSelection(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>): EmergencyContextualReviewerKnowledgeSelection {
  const routing = createEmergencyContextualReviewerRoutingReport(input);
  const reviewerKnowledgeRegistry = createDefaultReviewerKnowledgeRegistry(routing.selectedAcademyFolders);
  const knowledgeRegistry = createKnowledgeRegistryWithOptions(undefined, {
    academyFolders: routing.selectedAcademyFolders,
  });

  return Object.freeze({
    routing,
    reviewerKnowledgeRegistry,
    knowledgeRegistry,
  });
}
