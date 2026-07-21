import type { Evidence } from "../evidence/evidenceTypes.js";
import { normalizeConceptText, normalizeConceptCategory, uniqueSorted, buildConceptSummary } from "./conceptNormalizer.js";
import type { ConceptRecord, ConceptSeverity } from "./conceptTypes.js";

type ConceptDefinition = Readonly<{
  conceptId: string;
  conceptName: string;
  conceptCategory: string;
  knowledgeDomains: readonly string[];
  severity: ConceptSeverity;
  patterns: readonly RegExp[];
}>;

const CONCEPT_DEFINITIONS: readonly ConceptDefinition[] = Object.freeze([
  {
    conceptId: "profanity",
    conceptName: "Profanity",
    conceptCategory: "language",
    knowledgeDomains: ["profanity"],
    severity: "medium",
    patterns: [/كس\s*امة/u, /يا\s+(?:كلب|حمار|خنزير|غبي|حقير|قذر|وسخ|لعين)/u, /شتيمة|شتائم|سباب|سب|شتم/u],
  },
  {
    conceptId: "insult",
    conceptName: "Insult",
    conceptCategory: "language",
    knowledgeDomains: ["profanity", "society"],
    severity: "medium",
    patterns: [/أكرهك|أكرهكم/u, /يا\s+(?:غبي|حقير|ساقط|تافه)/u, /مهين|إهانة|إساءة/u],
  },
  {
    conceptId: "hostility",
    conceptName: "Hostility",
    conceptCategory: "violence",
    knowledgeDomains: ["profanity", "violence"],
    severity: "medium",
    patterns: [/موتوا|موتي|موتو|خلصوني منكم/u, /اخرجوا|انقلع/u, /سحقا|يا[.…\.]{1,}/u],
  },
  {
    conceptId: "threat",
    conceptName: "Threat",
    conceptCategory: "violence",
    knowledgeDomains: ["violence", "security"],
    severity: "high",
    patterns: [/سأقتلك|أقتلك|سأذبحك|أذبحك|سأضربك|أضربك/u, /سأنشر|سأفضحك|سأحرقك/u, /تهديد/u],
  },
  {
    conceptId: "violence",
    conceptName: "Violence",
    conceptCategory: "violence",
    knowledgeDomains: ["violence"],
    severity: "high",
    patterns: [/اقتل|أقتل|قتل/u, /أذبح|أضرب|طعن|دماء|ضرب|عنف/u],
  },
  {
    conceptId: "domestic_violence",
    conceptName: "Domestic Violence",
    conceptCategory: "family",
    knowledgeDomains: ["violence", "society"],
    severity: "critical",
    patterns: [/عنف\s+أسري/u, /يضرب\s+(?:زوجته|زوجها|أسرته)/u, /يعتدي\s+على\s+(?:زوجته|أسرته)/u],
  },
  {
    conceptId: "bullying",
    conceptName: "Bullying",
    conceptCategory: "society",
    knowledgeDomains: ["society"],
    severity: "medium",
    patterns: [/تنمر/u, /يسخر\s+من/u, /إذلال|تحقير/u],
  },
  {
    conceptId: "religion",
    conceptName: "Religion",
    conceptCategory: "religion",
    knowledgeDomains: ["religion"],
    severity: "medium",
    patterns: [/دين|إسلام|مسلم|مسيحي/u, /صلاة|مسجد|كنيسة/u, /الله|الرسول|النبي/u],
  },
  {
    conceptId: "crime",
    conceptName: "Crime",
    conceptCategory: "crime",
    knowledgeDomains: ["crime"],
    severity: "high",
    patterns: [/سرقة|أسرق|ثب/u, /ابتزاز|رشوة|فساد/u, /مجرم|جريمة|اختلاس|احتيال/u],
  },
  {
    conceptId: "bribery",
    conceptName: "Bribery",
    conceptCategory: "crime",
    knowledgeDomains: ["crime"],
    severity: "high",
    patterns: [/رشوة|يرشي/u, /مقابل\s+المال/u],
  },
  {
    conceptId: "fraud",
    conceptName: "Fraud",
    conceptCategory: "crime",
    knowledgeDomains: ["crime"],
    severity: "high",
    patterns: [/احتيال|محتال/u, /غش/u],
  },
  {
    conceptId: "blackmail",
    conceptName: "Blackmail",
    conceptCategory: "crime",
    knowledgeDomains: ["crime", "security"],
    severity: "high",
    patterns: [/ابتزاز|أبتز/u, /سأفضح/u, /سأنشر الصور|سأكشف/u],
  },
  {
    conceptId: "kidnapping",
    conceptName: "Kidnapping",
    conceptCategory: "crime",
    knowledgeDomains: ["crime", "security"],
    severity: "critical",
    patterns: [/اختطاف|يختطف|خطف/u],
  },
  {
    conceptId: "human_trafficking",
    conceptName: "Human Trafficking",
    conceptCategory: "crime",
    knowledgeDomains: ["crime", "security"],
    severity: "critical",
    patterns: [/اتجار\s+بالبشر/u, /تهريب\s+البشر/u],
  },
  {
    conceptId: "money_laundering",
    conceptName: "Money Laundering",
    conceptCategory: "finance",
    knowledgeDomains: ["crime"],
    severity: "high",
    patterns: [/غسل\s+الأموال|غسيل\s+الأموال/u],
  },
  {
    conceptId: "politics",
    conceptName: "Politics",
    conceptCategory: "politics",
    knowledgeDomains: ["politics"],
    severity: "medium",
    patterns: [/حكومة|دولة|وزارة|نظام/u, /رئيس|قيادة|سياسة|انتخابات|سياسي|السلطة/u],
  },
  {
    conceptId: "leadership",
    conceptName: "Leadership",
    conceptCategory: "politics",
    knowledgeDomains: ["politics"],
    severity: "low",
    patterns: [/قائد|قيادة|زعيم|رئيس|حكم|حاكم/u],
  },
  {
    conceptId: "government_interaction",
    conceptName: "Government Interaction",
    conceptCategory: "politics",
    knowledgeDomains: ["politics"],
    severity: "medium",
    patterns: [/وزارة|مكتب\s+الوزير|المجلس|البرلمان|الحكومة/u, /إجراء\s+رسمي/u],
  },
  {
    conceptId: "children",
    conceptName: "Children",
    conceptCategory: "children",
    knowledgeDomains: ["children"],
    severity: "high",
    patterns: [/طفل|طفلة|قاصر|أطفال|أولاد/u, /يا\s+صغير/u],
  },
  {
    conceptId: "sexuality",
    conceptName: "Sexuality",
    conceptCategory: "sexuality",
    knowledgeDomains: ["sexuality"],
    severity: "high",
    patterns: [/جنس|جنسي|عاري|عري|فاحش|إباحية|محتوى\s+جنسي/u],
  },
  {
    conceptId: "drugs",
    conceptName: "Drugs",
    conceptCategory: "drugs",
    knowledgeDomains: ["drugs"],
    severity: "high",
    patterns: [/مخدر|حشيش|خمر|سكران|مخدرات|تعاطي/u],
  },
  {
    conceptId: "alcohol",
    conceptName: "Alcohol",
    conceptCategory: "drugs",
    knowledgeDomains: ["drugs"],
    severity: "medium",
    patterns: [/كحول|يشرب\s+الخمر|الخمر/u],
  },
  {
    conceptId: "smoking",
    conceptName: "Smoking",
    conceptCategory: "health",
    knowledgeDomains: ["medical"],
    severity: "low",
    patterns: [/يدخن|سيجارة|تدخين/u],
  },
  {
    conceptId: "medical_procedure",
    conceptName: "Medical Procedure",
    conceptCategory: "medical",
    knowledgeDomains: ["medical"],
    severity: "medium",
    patterns: [/طبيب|عيادة|تشخيص|عملية\s+جراحية|وصفة/u],
  },
  {
    conceptId: "history",
    conceptName: "History",
    conceptCategory: "history",
    knowledgeDomains: ["history"],
    severity: "low",
    patterns: [/تاريخ|تاريخي|وثائقي|ماضي/u],
  },
  {
    conceptId: "media_publication",
    conceptName: "Media Publication",
    conceptCategory: "media",
    knowledgeDomains: ["media"],
    severity: "low",
    patterns: [/صحيفة|جريدة|بث|نشر|إعلان|وسيلة\s+إعلام/u],
  },
  {
    conceptId: "fake_news",
    conceptName: "Fake News",
    conceptCategory: "media",
    knowledgeDomains: ["media", "society"],
    severity: "medium",
    patterns: [/خبر\s+كاذب|إشاعة|شائعة/u, /معلومة\s+مضللة|مضلل/u],
  },
  {
    conceptId: "misinformation",
    conceptName: "Misinformation",
    conceptCategory: "media",
    knowledgeDomains: ["media", "society"],
    severity: "medium",
    patterns: [/معلومات\s+مضللة|تضليل|مضللة/u],
  },
  {
    conceptId: "religious_insult",
    conceptName: "Religious Insult",
    conceptCategory: "religion",
    knowledgeDomains: ["religion"],
    severity: "high",
    patterns: [/إهانة\s+الدين|سب\s+الله|سب\s+الرسول/u, /كفر|زندقة|ملحد/u],
  },
  {
    conceptId: "hate_speech",
    conceptName: "Hate Speech",
    conceptCategory: "society",
    knowledgeDomains: ["society"],
    severity: "high",
    patterns: [/كراهية|كراهية\s+ضد/u, /عنصري|عنصرية|تحريض\s+ضد/u],
  },
  {
    conceptId: "discrimination",
    conceptName: "Discrimination",
    conceptCategory: "society",
    knowledgeDomains: ["society"],
    severity: "high",
    patterns: [/تمييز|تمييز\s+ضد/u, /عنصرية/u],
  },
  {
    conceptId: "security",
    conceptName: "Security",
    conceptCategory: "security",
    knowledgeDomains: ["security"],
    severity: "high",
    patterns: [/إرهاب|انفجار|تفجير|تهديد/u, /شرطة|جيش|عسكري|أمن|سلاح|قنبلة/u],
  },
  {
    conceptId: "extremism",
    conceptName: "Extremism",
    conceptCategory: "security",
    knowledgeDomains: ["security", "religion"],
    severity: "critical",
    patterns: [/تطرف|متطرف|تكفيري/u],
  },
  {
    conceptId: "terrorist_recruitment",
    conceptName: "Terrorist Recruitment",
    conceptCategory: "security",
    knowledgeDomains: ["security"],
    severity: "critical",
    patterns: [/تجنيد.*إرهابي/u, /التحاق.*تنظيم/u, /انضمام.*للتنظيم/u],
  },
  {
    conceptId: "court_proceeding",
    conceptName: "Court Proceeding",
    conceptCategory: "politics",
    knowledgeDomains: ["politics", "crime"],
    severity: "low",
    patterns: [/محكمة|قاض|جلسة|نيابة|حكم\s+قضائي/u],
  },
  {
    conceptId: "police_interaction",
    conceptName: "Police Interaction",
    conceptCategory: "security",
    knowledgeDomains: ["security"],
    severity: "low",
    patterns: [/شرطة|ضابط|مركز\s+الشرطة|تحقيق\s+أمني/u],
  },
  {
    conceptId: "travel",
    conceptName: "Travel",
    conceptCategory: "travel",
    knowledgeDomains: ["travel"],
    severity: "low",
    patterns: [/سفر|رحلة|مطار|جواز|تأشيرة|فندق|سياحة/u],
  },
  {
    conceptId: "gambling",
    conceptName: "Gambling",
    conceptCategory: "finance",
    knowledgeDomains: ["crime"],
    severity: "medium",
    patterns: [/قمار|مقامرة|يراهن|رهان/u],
  },
  {
    conceptId: "self_harm",
    conceptName: "Self Harm",
    conceptCategory: "health",
    knowledgeDomains: ["medical", "violence"],
    severity: "critical",
    patterns: [/أنتحر|انتحار|أؤذي\s+نفسي|أقطع\s+نفسي/u],
  },
  {
    conceptId: "quiz_quotation",
    conceptName: "Quotation",
    conceptCategory: "contextual",
    knowledgeDomains: [],
    severity: "low",
    patterns: [/(?:«.*»|".*"|'.*')/u],
  },
  {
    conceptId: "education",
    conceptName: "Education",
    conceptCategory: "contextual",
    knowledgeDomains: [],
    severity: "low",
    patterns: [/(?:تعليمي|للتوضيح|شرح|أشرح|درس|تثقيف|تعليم)/u],
  },
]);

function normalizeEvidenceText(value: string): string {
  return normalizeConceptText(value);
}

function inferTargets(evidence: Evidence): readonly string[] {
  const targets = [evidence.target ?? "", ...(evidence.participants ?? [])];
  return uniqueSorted(targets);
}

function inferParticipants(evidence: Evidence): readonly string[] {
  const participants = [evidence.speaker ?? "", evidence.target ?? "", ...(evidence.participants ?? [])];
  return uniqueSorted(participants);
}

function inferSeverity(definition: ConceptDefinition): ConceptSeverity {
  return definition.severity;
}

function makeConceptConfidence(evidence: Evidence, definition: ConceptDefinition): number {
  const base = 0.68;
  const evidenceBoost = Math.min(0.22, evidence.confidence * 0.16);
  const patternBoost = Math.min(0.1, definition.patterns.length * 0.02);
  return Number(Math.min(1, base + evidenceBoost + patternBoost).toFixed(6));
}

function buildConceptRecord(definition: ConceptDefinition, evidence: Evidence): ConceptRecord {
  const confidence = makeConceptConfidence(evidence, definition);
  const evidenceText = evidence.text ?? evidence.rawText ?? "";
  const normalizedText = normalizeEvidenceText(evidenceText);
  const reason = `Matched ${definition.conceptName} against grounded evidence span ${evidence.id}.`;
  return Object.freeze({
    id: `concept-${definition.conceptId}-${evidence.id}`,
    evidenceId: evidence.id,
    evidenceSpanId: evidence.spanId,
    conceptId: definition.conceptId,
    conceptName: definition.conceptName,
    conceptCategory: normalizeConceptCategory(definition.conceptCategory),
    confidence,
    severity: inferSeverity(definition),
    targets: inferTargets(evidence),
    participants: inferParticipants(evidence),
    reason,
    supportingEvidenceIds: Object.freeze([evidence.id]),
    evidenceSpanIds: Object.freeze([evidence.spanId]),
    knowledgeDomains: uniqueSorted(definition.knowledgeDomains),
    label: definition.conceptName,
    rationale: Object.freeze([
      reason,
      `Evidence text: ${evidenceText}.`,
      `Normalized text: ${normalizedText}.`,
      `Concept category: ${definition.conceptCategory}.`,
    ]),
  });
}

function matchesDefinition(definition: ConceptDefinition, evidence: Evidence): boolean {
  const evidenceText = evidence.text ?? evidence.rawText ?? "";
  const normalizedText = normalizeEvidenceText(evidenceText);
  return definition.patterns.some((pattern) => pattern.test(normalizedText) || pattern.test(evidenceText));
}

export type ConceptMatchResult = Readonly<{
  evidenceId: string;
  evidenceSpanId: string;
  matchedConceptIds: readonly string[];
  normalizedText: string;
  rawText: string;
  records: readonly ConceptRecord[];
}>;

export function classifyEvidence(evidence: Evidence): ConceptMatchResult {
  const rawText = evidence.text ?? evidence.rawText ?? "";
  const normalizedText = normalizeEvidenceText(rawText);
  const records = CONCEPT_DEFINITIONS
    .filter((definition) => matchesDefinition(definition, evidence))
    .map((definition) => buildConceptRecord(definition, evidence));

  return Object.freeze({
    evidenceId: evidence.id,
    evidenceSpanId: evidence.spanId,
    matchedConceptIds: Object.freeze(records.map((record) => record.conceptId)),
    normalizedText,
    rawText,
    records: Object.freeze(records),
  });
}

export function getConceptDefinitions(): readonly ConceptDefinition[] {
  return CONCEPT_DEFINITIONS;
}

export function summarizeConceptClassification(result: ConceptMatchResult): string {
  if (result.records.length === 0) {
    return `evidence=${result.evidenceId}: no concepts detected`;
  }

  return result.records
    .map((record) => `${record.conceptId}(${record.confidence.toFixed(3)})`)
    .join(", ");
}

export function describeConceptDefinition(definition: ConceptDefinition): string {
  return `${definition.conceptName} [${definition.conceptCategory}] -> ${definition.knowledgeDomains.join(", ") || "none"} :: ${buildConceptSummary(definition.patterns[0]?.source ?? definition.conceptName)}`;
}

