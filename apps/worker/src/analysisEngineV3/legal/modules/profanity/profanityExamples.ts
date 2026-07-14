export type ProfanityExample = {
  readonly label: string;
  readonly semanticMeaning: string;
  readonly narrativeIntent: string;
  readonly evidenceText: string;
  readonly expectedStatus: "accept" | "needs_review" | "reject";
};

export const PROFANITY_EXAMPLES: readonly ProfanityExample[] = [
  {
    label: "Direct profanity",
    semanticMeaning: "A direct insult uttered in plain language.",
    narrativeIntent: "hostile",
    evidenceText: "يا كلب",
    expectedStatus: "accept",
  },
  {
    label: "Quoted profanity",
    semanticMeaning: "A profane phrase is quoted as quoted speech.",
    narrativeIntent: "quoted",
    evidenceText: "قال: «يا حمار»",
    expectedStatus: "reject",
  },
  {
    label: "Educational discussion",
    semanticMeaning: "The text discusses profanity as a language topic.",
    narrativeIntent: "instruction",
    evidenceText: "في الدرس ندرس معنى كلمة شتيمة وأمثلة عليها.",
    expectedStatus: "reject",
  },
  {
    label: "Condemnation of profanity",
    semanticMeaning: "The text condemns the use of profanity.",
    narrativeIntent: "condemnation",
    evidenceText: "هذا لفظ قبيح ومرفوض ولا يجوز قوله.",
    expectedStatus: "reject",
  },
  {
    label: "Story narration with profanity",
    semanticMeaning: "Narration includes a direct profane utterance.",
    narrativeIntent: "narration",
    evidenceText: "في الرواية قال الرجل: يا كذاب.",
    expectedStatus: "accept",
  },
  {
    label: "Dialogue profanity",
    semanticMeaning: "A character insults another in dialogue.",
    narrativeIntent: "dialogue",
    evidenceText: "A: يا نصاب",
    expectedStatus: "accept",
  },
  {
    label: "No profanity",
    semanticMeaning: "A neutral sentence without profanity.",
    narrativeIntent: "neutral",
    evidenceText: "جلسوا يتحدثون بهدوء عن العمل.",
    expectedStatus: "reject",
  },
];

