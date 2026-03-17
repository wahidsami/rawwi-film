/**
 * GCAM Canonical Atom Framework (v1) — structured content for prompt injection.
 * Each atom: definition, what to detect, what NOT to flag, examples, edge cases.
 */
import type { CanonicalAtom } from "./severityRulebook.js";

export type AtomDefinition = {
  id: CanonicalAtom;
  title_ar: string;
  definition: string;
  what_to_detect: string;
  what_not_to_flag: string;
  examples: string;
  edge_cases: string;
  mapped_gcam_atoms: string[];
};

const FRAMEWORK: AtomDefinition[] = [
  {
    id: "INSULT",
    title_ar: "الإهانة والسب",
    definition: "Any verbal or descriptive content that demeans, insults, humiliates, or attacks a person or group's dignity.",
    what_to_detect: "Direct insults (يا غبي، يا حرامي); accusations without proof (نصاب، كذاب); mockery or sarcasm meant to degrade; animal comparisons used offensively; family-based insults (ابن الـ...); tone indicating humiliation or contempt.",
    what_not_to_flag: "Neutral disagreement; constructive criticism; non-abusive sarcasm.",
    examples: "إنت إنسان حقير؛ هو واحد حمار ما بيفهم",
    edge_cases: "Villain dialogue → still flagged. Comedy → still violation if insulting.",
    mapped_gcam_atoms: ["4-1", "5-2", "7-2", "17-1", "17-2"],
  },
  {
    id: "VIOLENCE",
    title_ar: "العنف والإيذاء",
    definition: "Any depiction, threat, or description of physical or psychological harm.",
    what_to_detect: "Physical actions (ضرب، صفع، ركل); threats (هقتلك); weapons (سكين، مسدس); injury descriptions (دم، جروح); torture or abuse.",
    what_not_to_flag: "Mild non-harmful actions (e.g. tapping shoulder); purely symbolic language without harm.",
    examples: "يضربه بعنف؛ سأقتلك الليلة",
    edge_cases: "Action scenes → still violations. Off-screen violence → still counts if described.",
    mapped_gcam_atoms: ["4", "5-1", "6-1", "9-1", "9-3"],
  },
  {
    id: "SEXUAL",
    title_ar: "المحتوى الجنسي والإيحاءات",
    definition: "Any explicit or implicit reference to sexual acts, desire, or body-related arousal.",
    what_to_detect: "Sexual dialogue or innuendo; descriptions of body parts in a suggestive way; romantic/physical intimacy (if suggestive); adultery or illicit relations; seduction language.",
    what_not_to_flag: "Neutral romantic dialogue; non-suggestive affection.",
    examples: "عايزك الليلة؛ ينظر إلى جسدها بشهوة",
    edge_cases: "Euphemisms (ينام معها) → must detect. Cultural indirect language → still counts.",
    mapped_gcam_atoms: ["4-7", "5-3", "9-4", "23", "24"],
  },
  {
    id: "SUBSTANCES",
    title_ar: "المخدرات والكحول",
    definition: "Any mention, depiction, or normalization of drug, alcohol, or smoking use.",
    what_to_detect: "Drinking, smoking, drug use; party scenes involving substances; positive framing (يرتاح لما يشرب); addiction behavior.",
    what_not_to_flag: "Negative portrayal with consequences (still detect but lower severity later).",
    examples: "يشرب خمر؛ يشعل سيجارة",
    edge_cases: "Casual background use → still flagged. Stylish/glamorous use → higher severity.",
    mapped_gcam_atoms: ["5-4", "10-1", "10-2", "10-3", "10-4", "10-5"],
  },
  {
    id: "DISCRIMINATION",
    title_ar: "التمييز وخطاب الكراهية",
    definition: "Any content that attacks or excludes a group based on identity.",
    what_to_detect: "Racism, sexism, religious bias; generalizations (كل النساء...); hate speech; superiority claims.",
    what_not_to_flag: "Neutral identity mentions; non-hostile cultural references.",
    examples: "النساء ما ينفعوش؛ هذول أقل مننا",
    edge_cases: "Historical context → still flagged. Character bias → still flagged.",
    mapped_gcam_atoms: ["5", "7", "8"],
  },
  {
    id: "CHILD_SAFETY",
    title_ar: "حماية الأطفال",
    definition: "Any content that harms, exploits, or negatively influences children.",
    what_to_detect: "Violence against children; bullying children; risky behavior normalized; child exploitation.",
    what_not_to_flag: "Protective or educational context.",
    examples: "يضرب الطفل؛ الطفل يدخن",
    edge_cases: "Teen characters → still considered minors. Humor involving kids → still flagged if harmful.",
    mapped_gcam_atoms: ["6-1", "6-2", "6-3", "6-4", "6-5"],
  },
  {
    id: "WOMEN",
    title_ar: "حقوق المرأة",
    definition: "Any content that undermines women's dignity, safety, or equality.",
    what_to_detect: "Harassment; victim blaming; gender stereotypes; objectification.",
    what_not_to_flag: "Neutral gender roles; empowering narratives.",
    examples: "هي السبب في اللي حصل لها؛ مكان المرأة في البيت",
    edge_cases: "Romantic persistence → may be harassment. Cultural norms → still evaluated strictly.",
    mapped_gcam_atoms: ["7-1", "7-2", "7-3", "7-4", "7-5"],
  },
  {
    id: "MISINFORMATION",
    title_ar: "التضليل",
    definition: "Presenting false or misleading information as factual.",
    what_to_detect: "Fake facts; misleading claims; blurring fiction/reality.",
    what_not_to_flag: "Clearly fictional content.",
    examples: "هذا علاج يشفي كل الأمراض",
    edge_cases: "Based on real events → higher scrutiny.",
    mapped_gcam_atoms: ["11", "16"],
  },
  {
    id: "PUBLIC_ORDER",
    title_ar: "الأمن والنظام",
    definition: "Content that encourages instability, chaos, or rule-breaking.",
    what_to_detect: "Calls to violence; encouraging law-breaking; social unrest.",
    what_not_to_flag: "",
    examples: "لا تلتزم بالقوانين؛ اخرجوا وخربوا",
    edge_cases: "",
    mapped_gcam_atoms: ["12", "13", "14"],
  },
  {
    id: "EXTREMISM",
    title_ar: "التطرف",
    definition: "Any support, promotion, or normalization of extremist ideologies or groups.",
    what_to_detect: "Terrorism references; extremist ideology; symbols/slogans.",
    what_not_to_flag: "",
    examples: "نؤيد الجماعة؛ استخدام شعارات متطرفة",
    edge_cases: "",
    mapped_gcam_atoms: ["9-2", "15"],
  },
  {
    id: "INTERNATIONAL",
    title_ar: "العلاقات الدولية",
    definition: "Content that insults or harms relations with countries or peoples.",
    what_to_detect: "Mocking nations; offensive generalizations.",
    what_not_to_flag: "",
    examples: "",
    edge_cases: "",
    mapped_gcam_atoms: ["18"],
  },
  {
    id: "ECONOMIC",
    title_ar: "الاقتصاد والتجارة",
    definition: "Content that spreads harmful or misleading economic narratives.",
    what_to_detect: "Panic creation; false financial claims.",
    what_not_to_flag: "",
    examples: "",
    edge_cases: "",
    mapped_gcam_atoms: ["19", "20"],
  },
  {
    id: "PRIVACY",
    title_ar: "الخصوصية والسمعة",
    definition: "Any violation of personal dignity, reputation, or privacy.",
    what_to_detect: "Defamation; exposure of private info; personal attacks.",
    what_not_to_flag: "",
    examples: "",
    edge_cases: "",
    mapped_gcam_atoms: ["17"],
  },
  {
    id: "APPEARANCE",
    title_ar: "المظهر والاحتشام",
    definition: "Any depiction of clothing or appearance that violates cultural or modesty standards.",
    what_to_detect: "Revealing clothing; sexualized appearance; suggestive visual descriptions.",
    what_not_to_flag: "",
    examples: "ترتدي ملابس فاضحة؛ جسدها مكشوف",
    edge_cases: "",
    mapped_gcam_atoms: ["23", "24"],
  },
];

const BY_ID = new Map<CanonicalAtom, AtomDefinition>(FRAMEWORK.map((a) => [a.id, a]));

export function getAtomDefinition(atom: CanonicalAtom | string): AtomDefinition | undefined {
  return BY_ID.get(atom as CanonicalAtom);
}

/**
 * Build a prompt section for one canonical atom (Definition + What to Detect + What NOT to flag + Examples).
 * Use in Judge/detection prompts per Framework "AI Prompt Usage".
 */
export function getFrameworkPromptSection(atom: CanonicalAtom | string): string {
  const def = getAtomDefinition(atom);
  if (!def) return "";
  const parts: string[] = [
    `[${def.id} — ${def.title_ar}]`,
    `Definition: ${def.definition}`,
    `What to detect: ${def.what_to_detect}`,
  ];
  if (def.what_not_to_flag) parts.push(`What NOT to flag: ${def.what_not_to_flag}`);
  if (def.examples) parts.push(`Examples: ${def.examples}`);
  if (def.edge_cases) parts.push(`Edge cases: ${def.edge_cases}`);
  return parts.join("\n");
}

/**
 * Build prompt sections for multiple canonical atoms (e.g. for a combined pass).
 */
export function getFrameworkPromptSections(atoms: (CanonicalAtom | string)[]): string {
  return atoms.map(getFrameworkPromptSection).filter(Boolean).join("\n\n");
}

export { FRAMEWORK };
