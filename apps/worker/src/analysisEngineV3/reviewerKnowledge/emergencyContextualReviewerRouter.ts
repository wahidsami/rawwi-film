import type { ConceptContext } from "../concepts/conceptTypes.js";
import { resolveUniversalConceptsFromRouting, type UniversalConceptResolution } from "../concepts/universalConceptResolver.js";
import type { V3PromptBuilderInput } from "../builder/builderTypes.js";
import type { ReviewerAssessment } from "../reviewerMethodology/reviewerMethodologyTypes.js";
import { createKnowledgeRegistryWithOptions, type KnowledgeRegistry } from "./knowledgeRegistry/index.js";
import {
  buildCanonicalArticleOwnershipMap,
  createDefaultReviewerKnowledgeRegistry,
  type ReviewerCanonicalArticleOwnershipMap,
  type ReviewerKnowledgeRegistry,
} from "./reviewerKnowledgeRegistry.js";

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
  detectedConceptIds?: readonly string[];
  detectedConceptLabels?: readonly string[];
  knowledgeDomains?: readonly string[];
  evidenceType?: string;
  sceneDescriptionType?: string;
  storyContextType?: string;
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
  canonicalArticleOwnershipByArticleId: ReviewerCanonicalArticleOwnershipMap;
}>;

let cachedCanonicalArticleOwnershipByArticleId: ReviewerCanonicalArticleOwnershipMap | null = null;

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
  resolution: UniversalConceptResolution;
}>): readonly string[] {
  const promptInput = input.promptInput;
  const assessment = input.assessment;
  const conceptContext = input.conceptContext;
  const resolution = input.resolution;

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
    ...(resolution.detectedConceptIds ?? []),
    ...(resolution.detectedConceptLabels ?? []),
    ...(resolution.knowledgeDomains ?? []),
    ...(resolution.detectedEntities ?? []),
    ...(resolution.detectedActions ?? []),
    resolution.evidenceType,
    resolution.sceneDescriptionType,
    resolution.storyContextType,
    resolution.reason,
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

function buildRoutingReason(
  resolution: UniversalConceptResolution,
  selected: readonly ReviewerRoutingScore[],
  universalOnly: boolean,
  signals: readonly string[],
): string {
  const signalPreview = signals.slice(0, 6).join(" | ");
  if (universalOnly) {
    return `Universal-only routing. ${resolution.reason} Signals: ${signalPreview}`;
  }

  const selectedLabels = selected.map((reviewer) => reviewer.label).join(", ");
  const selectedReasons = selected.flatMap((reviewer) => reviewer.reasons.length > 0 ? [reviewer.reasons.join(" | ")] : []);
  return `Concept-driven routing for knowledge domains ${resolution.knowledgeDomains.join(", ")}. Selected reviewers: ${selectedLabels}. ${selectedReasons.length > 0 ? `Reasons: ${selectedReasons.join(" || ")}.` : ""} Signals: ${signalPreview}`;
}

export function createEmergencyContextualReviewerRoutingReport(input: Readonly<{
  promptInput: V3PromptBuilderInput;
  conceptContext: ConceptContext;
  assessment: ReviewerAssessment;
}>): EmergencyContextualReviewerRoutingReport {
  const resolution = resolveUniversalConceptsFromRouting(input);
  const signals = collectSignals({ ...input, resolution });
  const scored = REVIEWER_ROUTING_PROFILES
    .filter((profile) => profile.reviewerId !== UNIVERSAL_PROFILE.reviewerId)
    .map((profile) => scoreProfile(profile, signals))
    .sort((left, right) => right.score - left.score || left.reviewerId.localeCompare(right.reviewerId) || left.packId.localeCompare(right.packId));

  const selectedDomainFolders = Object.freeze(
    [...new Set(resolution.knowledgeDomains.map((domain) => normalizeText(domain)).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .map((domain) => {
        const matching = scored.filter((profile) => normalizeText(profile.folder) === domain || normalizeText(profile.reviewerId) === domain || normalizeText(profile.label) === domain);
        return matching[0] ?? null;
      })
      .filter((profile): profile is ReviewerRoutingScore => profile !== null),
  ).slice().sort((left, right) => right.score - left.score || left.reviewerId.localeCompare(right.reviewerId));
  const universalOnly = selectedDomainFolders.length === 0;
  const selectedReviewerIds = Object.freeze([UNIVERSAL_PROFILE.reviewerId, ...(universalOnly ? [] : selectedDomainFolders.map((reviewer) => reviewer.reviewerId))]);
  const selectedReviewerLabels = Object.freeze([UNIVERSAL_PROFILE.label, ...(universalOnly ? [] : selectedDomainFolders.map((reviewer) => reviewer.label))]);
  const selectedReviewerPackIds = Object.freeze(universalOnly ? [UNIVERSAL_PROFILE.packId] : [UNIVERSAL_PROFILE.packId, ...selectedDomainFolders.map((reviewer) => reviewer.packId)]);
  const selectedAcademyFolders = Object.freeze(universalOnly ? [UNIVERSAL_PROFILE.folder] : [UNIVERSAL_PROFILE.folder, ...selectedDomainFolders.map((reviewer) => reviewer.folder)]);
  const rejectedSubjectReviewers = scored.filter((reviewer) => !selectedDomainFolders.some((selected) => selected.reviewerId === reviewer.reviewerId));
  const rejectedReviewerIds = Object.freeze(rejectedSubjectReviewers.map((reviewer) => reviewer.reviewerId));
  const rejectedReviewerLabels = Object.freeze(rejectedSubjectReviewers.map((reviewer) => reviewer.label));
  const routingConfidence = Number(resolution.confidence.toFixed(6));
  const lowConfidence = resolution.confidence < 0.55;

  const totalReviewerCount = REVIEWER_ROUTING_PROFILES.length;
  const loadedAcademyCount = selectedAcademyFolders.length;
  const skippedAcademyCount = Math.max(0, totalReviewerCount - loadedAcademyCount);
  const knowledgeReductionPercent = totalReviewerCount === 0
    ? 0
    : Number(((skippedAcademyCount / totalReviewerCount) * 100).toFixed(2));
  const routingReason = buildRoutingReason(resolution, selectedDomainFolders, universalOnly, signals);

  return Object.freeze({
    detectedConceptIds: resolution.detectedConceptIds,
    detectedConceptLabels: resolution.detectedConceptLabels,
    knowledgeDomains: resolution.knowledgeDomains,
    evidenceType: resolution.evidenceType,
    sceneDescriptionType: resolution.sceneDescriptionType,
    storyContextType: resolution.storyContextType,
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
  const canonicalArticleOwnershipByArticleId = cachedCanonicalArticleOwnershipByArticleId
    ?? (cachedCanonicalArticleOwnershipByArticleId = buildCanonicalArticleOwnershipMap(createDefaultReviewerKnowledgeRegistry()));
  const knowledgeRegistry = createKnowledgeRegistryWithOptions(undefined, {
    academyFolders: routing.selectedAcademyFolders,
  });

  return Object.freeze({
    routing,
    reviewerKnowledgeRegistry,
    knowledgeRegistry,
    canonicalArticleOwnershipByArticleId,
  });
}
