export type ReviewerScopeDeclaration = Readonly<{
  reviewerId: string;
  label: string;
  folder: string;
  packId: string;
  ownedCategories: readonly string[];
  cannotClassifyCategories: readonly string[];
}>;

const ALL_REVIEWER_SCOPE_CATEGORIES = Object.freeze([
  "abuse",
  "artistic_context",
  "assault",
  "authority",
  "banned_group",
  "bribery",
  "bullying",
  "child_crime",
  "child_violence",
  "condemnation",
  "context",
  "crime",
  "cultural_insults",
  "cyber_attack",
  "cybercrime",
  "discrimination",
  "documentary_context",
  "documentary_violence",
  "drug_use",
  "drugs",
  "education",
  "educational_context",
  "election",
  "explicit_scenes",
  "extremism",
  "exploitation",
  "family_destruction",
  "fabricated_history",
  "false_documentary_claims",
  "faith",
  "grooming",
  "government",
  "graphic_violence",
  "hate_speech",
  "historical_context",
  "historical_distortion",
  "incitement",
  "insult",
  "intimate_content",
  "journey",
  "leadership",
  "medical_context",
  "military_disclosure",
  "mockery",
  "moral_corruption",
  "murder",
  "narrative",
  "neglect",
  "nudity",
  "parental_neglect",
  "passport",
  "political_context",
  "promotion",
  "public_order",
  "quotation",
  "racism",
  "recruitment",
  "religion",
  "religious_context",
  "religious_insult",
  "riot",
  "role_play",
  "sabotage",
  "scene",
  "sectarianism",
  "self_defense",
  "sexually_explicit",
  "sexual_content",
  "stereotyping",
  "state_reference",
  "story",
  "terrorism",
  "theft",
  "tourism",
  "trafficking",
  "travel",
  "tribal_attacks",
  "violence",
  "violence_documentary",
  "weaponry",
] as const);

function buildCannotClassifyCategories(ownedCategories: readonly string[]): readonly string[] {
  const owned = new Set(ownedCategories);
  return Object.freeze(
    ALL_REVIEWER_SCOPE_CATEGORIES.filter((category) => !owned.has(category)).sort((left, right) => left.localeCompare(right)),
  );
}

function createDeclaration(input: Readonly<{
  reviewerId: string;
  label: string;
  folder: string;
  packId: string;
  ownedCategories: readonly string[];
}>): ReviewerScopeDeclaration {
  return Object.freeze({
    reviewerId: input.reviewerId,
    label: input.label,
    folder: input.folder,
    packId: input.packId,
    ownedCategories: Object.freeze([...new Set(input.ownedCategories)].sort((left, right) => left.localeCompare(right))),
    cannotClassifyCategories: buildCannotClassifyCategories(input.ownedCategories),
  });
}

const REVIEWER_SCOPE_MATRIX: readonly ReviewerScopeDeclaration[] = Object.freeze([
  createDeclaration({
    reviewerId: "v3_00_universal",
    label: "Universal GCAM Guidance",
    folder: "universal",
    packId: "v3_00_universal",
    ownedCategories: [
      "context",
      "education",
      "documentary_context",
      "historical_context",
      "quotation",
      "role_play",
      "scene",
      "story",
      "narrative",
    ],
  }),
  createDeclaration({
    reviewerId: "v4_11_profanity",
    label: "Profanity Reviewer",
    folder: "profanity",
    packId: "v4_11_profanity",
    ownedCategories: ["abuse", "insult", "mockery", "profanity"],
  }),
  createDeclaration({
    reviewerId: "v3_05_society",
    label: "Society Reviewer",
    folder: "society",
    packId: "v3_05_society",
    ownedCategories: ["cultural_insults", "discrimination", "hate_speech", "racism", "sectarianism", "stereotyping", "tribal_attacks"],
  }),
  createDeclaration({
    reviewerId: "v3_05_children",
    label: "Children Reviewer",
    folder: "children",
    packId: "v3_05_children",
    ownedCategories: ["abuse", "child_crime", "child_violence", "exploitation", "grooming", "neglect", "psychological_abuse"],
  }),
  createDeclaration({
    reviewerId: "v3_03_security",
    label: "National Security Reviewer",
    folder: "security",
    packId: "v3_03_security",
    ownedCategories: ["cyber_attack", "extremism", "military_disclosure", "public_order", "recruitment", "riot", "sabotage", "terrorism"],
  }),
  createDeclaration({
    reviewerId: "v3_08_violence",
    label: "Violence Reviewer",
    folder: "violence",
    packId: "v3_08_violence",
    ownedCategories: ["condemned_violence", "domestic_violence", "documentary_violence", "graphic_violence", "murder", "self_defense", "torture", "weaponry"],
  }),
  createDeclaration({
    reviewerId: "v3_07_sexuality",
    label: "Sexual Content Reviewer",
    folder: "sexuality",
    packId: "v3_07_sexuality",
    ownedCategories: ["artistic_context", "educational_context", "explicit_scenes", "implied_scenes", "medical_context", "nudity", "sexual_content"],
  }),
  createDeclaration({
    reviewerId: "v3_12_drugs",
    label: "Drugs Reviewer",
    folder: "drugs",
    packId: "v3_12_drugs",
    ownedCategories: ["drug_use", "drugs", "manufacture", "medical_context", "promotion", "rehabilitation", "trafficking"],
  }),
  createDeclaration({
    reviewerId: "v3_01_religion",
    label: "Religion Reviewer",
    folder: "religion",
    packId: "v3_01_religion",
    ownedCategories: ["faith", "religion", "religious_context", "religious_insult"],
  }),
  createDeclaration({
    reviewerId: "v3_04_politics",
    label: "Politics Reviewer",
    folder: "politics",
    packId: "v3_04_politics",
    ownedCategories: ["authority", "government", "election", "leadership", "political_context", "state_reference"],
  }),
  createDeclaration({
    reviewerId: "v3_09_crime",
    label: "Crime Reviewer",
    folder: "crime",
    packId: "v3_09_crime",
    ownedCategories: ["assault", "bribery", "crime", "cybercrime", "extortion", "fraud", "murder", "theft"],
  }),
  createDeclaration({
    reviewerId: "v3_04_history",
    label: "History Reviewer",
    folder: "history",
    packId: "v3_04_history",
    ownedCategories: ["fabricated_history", "false_documentary_claims", "historical_context", "historical_distortion", "historical_quote", "misleading_presentation"],
  }),
  createDeclaration({
    reviewerId: "v3_13_travel",
    label: "Travel Reviewer",
    folder: "travel",
    packId: "v3_13_travel",
    ownedCategories: ["airport", "hotel", "journey", "passport", "tourism", "travel", "visa"],
  }),
  createDeclaration({
    reviewerId: "v3_04_family_values",
    label: "Family Values Reviewer",
    folder: "family_values",
    packId: "v3_04_family_values",
    ownedCategories: ["abuse", "family_destruction", "glorification", "humiliation", "moral_corruption", "parental_neglect"],
  }),
]);

export function listReviewerScopeDeclarations(): readonly ReviewerScopeDeclaration[] {
  return REVIEWER_SCOPE_MATRIX;
}

export function getReviewerScopeDeclaration(reviewerId: string): ReviewerScopeDeclaration | null {
  const normalized = reviewerId.trim().toLowerCase();
  return REVIEWER_SCOPE_MATRIX.find((entry) => entry.reviewerId.toLowerCase() === normalized) ?? null;
}

export function getReviewerScopeDeclarationsByIds(reviewerIds: readonly string[]): readonly ReviewerScopeDeclaration[] {
  const selected = new Set(reviewerIds.map((reviewerId) => reviewerId.trim().toLowerCase()));
  return REVIEWER_SCOPE_MATRIX.filter((entry) => selected.has(entry.reviewerId.toLowerCase()));
}
