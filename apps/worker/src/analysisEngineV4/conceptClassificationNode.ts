import type {
  SceneAnalysisConcept,
  SceneAnalysisEvidenceSpan,
  SceneAnalysisState,
} from "./sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "./sceneAnalysisState.js";

type ConceptDefinition = Readonly<{
  conceptId: string;
  label: string;
  domains: readonly string[];
  pattern: RegExp;
}>;

const CONCEPT_DEFINITIONS: readonly ConceptDefinition[] = Object.freeze([
  { conceptId: "profanity", label: "Profanity", domains: ["profanity"], pattern: /(?:كس\s*امة|يا\s+(?:كلب|حمار|خنزير|غبي|حقير|قذر|وسخ|لعين)|شتيمة|شتائم|سباب|سب|شتم|يا[.…\.]{1,})/u },
  { conceptId: "insult", label: "Insult", domains: ["profanity", "society"], pattern: /(?:أكرهك|أكرهكم|يا\s+(?:غبي|حقير|ساقط|تافه)|مهين|إهانة|إساءة)/u },
  { conceptId: "hostility", label: "Hostility", domains: ["profanity", "violence"], pattern: /(?:موتوا|موتي|موتو|خلصوني منكم|اخرجوا|انقلع|أكرهك|أكرهكم|سحقا|يا[.…\.]{1,})/u },
  { conceptId: "threat", label: "Threat", domains: ["violence", "security"], pattern: /(?:سأقتلك|أقتلك|سأذبحك|أذبحك|سأضربك|أضربك|سأنشر|سأفضحك|سأحرقك|تهديد)/u },
  { conceptId: "violence", label: "Violence", domains: ["violence"], pattern: /(?:اقتل|أقتل|قتل|سأقتلك|أذبح|أضرب|طعن|دماء|ضرب|عنف)/u },
  { conceptId: "religion", label: "Religion", domains: ["religion"], pattern: /(?:دين|إسلام|مسلم|مسيحي|صلاة|مسجد|كنيسة|الله|الرسول|النبي)/u },
  { conceptId: "crime", label: "Crime", domains: ["crime"], pattern: /(?:سرقة|أسرق|ثب|ابتزاز|رشوة|فساد|مجرم|جريمة|اختلاس|احتيال)/u },
  { conceptId: "politics", label: "Politics", domains: ["politics"], pattern: /(?:حكومة|دولة|وزارة|نظام|رئيس|قيادة|سياسة|انتخابات|سياسي|السلطة)/u },
  { conceptId: "leadership", label: "Leadership", domains: ["politics"], pattern: /(?:قائد|قيادة|زعيم|رئيس|حكم|حاكم)/u },
  { conceptId: "children", label: "Children", domains: ["children"], pattern: /(?:طفل|طفلة|قاصر|أطفال|أولاد|يا صغير)/u },
  { conceptId: "sexuality", label: "Sexuality", domains: ["sexuality"], pattern: /(?:جنس|جنسي|عاري|عري|فاحش|إباحية|محتوى جنسي)/u },
  { conceptId: "drugs", label: "Drugs", domains: ["drugs"], pattern: /(?:مخدر|حشيش|خمر|سكران|مخدرات|تعاطي)/u },
  { conceptId: "history", label: "History", domains: ["history"], pattern: /(?:تاريخ|تاريخي|وثائقي|ماضي)/u },
  { conceptId: "travel", label: "Travel", domains: ["travel"], pattern: /(?:سفر|رحلة|مطار|جواز|تأشيرة|فندق|سياحة)/u },
  { conceptId: "society", label: "Society", domains: ["society"], pattern: /(?:عائلة|أسرة|مجتمع|بيت|خصوصية|فضح|ابتزاز)/u },
  { conceptId: "security", label: "Security", domains: ["security"], pattern: /(?:إرهاب|انفجار|تفجير|تهديد|شرطة|جيش|عسكري|أمن|سلاح|قنبلة)/u },
  { conceptId: "privacy", label: "Privacy", domains: ["crime", "society"], pattern: /(?:خصوصية|صورة خاصة|صور خاصة|بيانات شخصية|فضح|تسريب)/u },
  { conceptId: "blackmail", label: "Blackmail", domains: ["crime", "security"], pattern: /(?:ابتزاز|أبتز|سأفضح|سأنشر الصور|سأكشف)/u },
  { conceptId: "education", label: "Education", domains: [], pattern: /(?:تعليمي|للتوضيح|شرح|أشرح|درس|تثقيف|تعليم)/u },
  { conceptId: "quotation", label: "Quotation", domains: [], pattern: /(?:«.*»|".*"|'.*')/u },
]);

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function selectTargetEvidenceSpan(state: SceneAnalysisState): SceneAnalysisEvidenceSpan | null {
  if (state.evidenceSpans.length === 0) {
    return null;
  }

  return state.evidenceSpans.find((span) => span.spanId === state.primaryEvidenceSpanId) ?? state.evidenceSpans[0] ?? null;
}

function scoreConcept(definition: ConceptDefinition, evidence: SceneAnalysisEvidenceSpan): SceneAnalysisConcept | null {
  const text = normalizeText(evidence.text);
  const matchesText = definition.pattern.test(text) || definition.pattern.test(evidence.text);
  if (!matchesText) {
    return null;
  }

  const evidenceStrength = 0.7 + Math.min(0.3, evidence.confidence * 0.2);
  return Object.freeze({
    conceptId: definition.conceptId,
    label: definition.label,
    knowledgeDomains: uniqueSorted(definition.domains),
    evidenceSpanIds: Object.freeze([evidence.spanId]),
    confidence: Number(evidenceStrength.toFixed(6)),
    rationale: Object.freeze([
      `Matched ${definition.label} against one grounded evidence span.`,
      `What happened: ${evidence.text}.`,
    ]),
  });
}

function classifyTargetEvidence(evidence: SceneAnalysisEvidenceSpan): readonly SceneAnalysisConcept[] {
  return Object.freeze(
    CONCEPT_DEFINITIONS
      .map((definition) => scoreConcept(definition, evidence))
      .filter((value): value is SceneAnalysisConcept => value !== null)
      .sort((left, right) => right.confidence - left.confidence || left.conceptId.localeCompare(right.conceptId)),
  );
}

function attachConceptsToEvidence(
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[],
  targetEvidence: SceneAnalysisEvidenceSpan,
  concepts: readonly SceneAnalysisConcept[],
): readonly SceneAnalysisEvidenceSpan[] {
  const conceptIds = concepts.map((concept) => concept.conceptId);

  return Object.freeze(evidenceSpans.map((span) => {
    if (span.spanId !== targetEvidence.spanId) {
      return span;
    }

    return Object.freeze({
      ...span,
      conceptIds: Object.freeze(conceptIds),
      rationale: concepts.length > 0
        ? Object.freeze(concepts.flatMap((concept) => concept.rationale))
        : Object.freeze(["No semantic concept matched this evidence span."]),
    });
  }));
}

export function classifyCandidateEvidence(state: SceneAnalysisState): Readonly<{
  targetEvidence: SceneAnalysisEvidenceSpan | null;
  concepts: readonly SceneAnalysisConcept[];
}> {
  const targetEvidence = selectTargetEvidenceSpan(state);
  if (!targetEvidence) {
    return Object.freeze({
      targetEvidence: null,
      concepts: Object.freeze([]),
    });
  }

  return Object.freeze({
    targetEvidence,
    concepts: classifyTargetEvidence(targetEvidence),
  });
}

export function createConceptClassificationNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const classification = classifyCandidateEvidence(state);
    if (!classification.targetEvidence) {
      return freezeSceneAnalysisState({
        ...state,
        detectedConcepts: Object.freeze([]),
      });
    }

    const evidenceSpans = attachConceptsToEvidence(state.evidenceSpans, classification.targetEvidence, classification.concepts);

    return freezeSceneAnalysisState({
      ...state,
      evidenceSpans,
      detectedConcepts: classification.concepts,
    });
  };
}
