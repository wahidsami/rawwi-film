import { getPrimaryCanonicalAtomForGcam } from "../../canonicalAtomMapping.js";
import { derivePolicyConceptCode, getPolicyAtomIdsForArticle, normalizeAtomId } from "../../policyMap.js";
import type { JudgeFinding } from "../../schemas.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalEvidenceCandidate, LegalContextResult } from "../legal/legalTypes.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import type { V3ReasonedDecisionResult } from "../provider/providerTypes.js";
import { createGcamMapperRegistry } from "../reviewerKnowledge/gcamMapper/index.js";
import type {
  GcamMapperInput,
  GcamMapperRegistry,
  GcamMapperResult,
} from "../reviewerKnowledge/gcamMapper/schemas/gcamMapperTypes.js";
import type { V3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import type { V3RuntimeFinding } from "./runtimeTypes.js";
import { logger } from "../../logger.js";
import { evaluatePolicyDisposition } from "../policy/policyEngine.js";

const DEFAULT_GCAM_MAPPER_REGISTRY = createGcamMapperRegistry();

function clampOffset(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function pickPrimaryEvidence(decision: LegalDecision): LegalEvidenceCandidate | null {
  if (decision.evidence.primaryCandidateIndex === null) return null;
  return decision.evidence.candidates[decision.evidence.primaryCandidateIndex] ?? null;
}

function pickEvaluationEvidence(decision: LegalDecision, evaluationEvidence: readonly string[]): LegalEvidenceCandidate | null {
  if (decision.evidence.candidates.length === 0) return null;
  const normalizedEvaluationEvidence = new Set(evaluationEvidence.map((value) => normalizeText(value)));
  const matchingCandidate = decision.evidence.candidates.find((candidate) => normalizedEvaluationEvidence.has(normalizeText(candidate.text)));
  return matchingCandidate ?? pickPrimaryEvidence(decision) ?? decision.evidence.candidates[0] ?? null;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function hasAny(text: string, terms: readonly string[]): boolean {
  const normalized = normalizeText(text);
  return terms.some((term) => normalized.includes(normalizeText(term)));
}

function inferConcepts(intelligence: IntelligenceContext): readonly string[] {
  const concepts = new Set(intelligence.conceptContext.conceptIds.map((concept) => normalizeText(concept)));
  const targetText = normalizeText([
    intelligence.target ?? "",
    intelligence.victim ?? "",
    intelligence.semantic.target ?? "",
    intelligence.semantic.victim ?? "",
    ...intelligence.entities
      .filter((entity) => entity.role === "target" || entity.role === "victim")
      .map((entity) => entity.label),
  ].join(" "));
  const evidenceText = normalizeText([
    intelligence.semantic.semanticMeaning,
    intelligence.context.localContext,
    intelligence.context.narrativeContext,
    intelligence.context.chunkContext,
    intelligence.storyMemory ?? "",
    intelligence.evidenceAssessment.primaryText,
  ].join(" "));

  if (/[رر]ئيس|حكومة|دولة|ملك|أمير|زعيم|حاكم|وزارة|برلمان|مجلس|government|president|state|king|leader|minister/.test(targetText) || hasAny(evidenceText, ["الرئيس", "الحكومة", "الدولة", "الملك", "الأمير", "الزعيم", "الحاكم", "الوزارة", "البرلمان", "government", "president", "state", "king", "leader", "minister"])) {
    concepts.add("government_reference");
    concepts.add("state_reference");
    concepts.add("government_institution");
  }
  if (hasAny(evidenceText, ["إرهاب", "إرهابي", "متطرف", "تطرف", "extremism", "terrorism", "داعش", "القاعدة", "جندوا", "جند", "يجند", "تجنيد", "انضموا", "بايعوا", "sabotage", "تخريب", "اختراق", "cyber", "هجوم إلكتروني", "شغب", "فوضى", "riot", "riots", "civil unrest", "public disorder", "mass panic"])) {
    concepts.add("security");
    concepts.add("state_security");
    concepts.add("national_security");
  }
  if (hasAny(evidenceText, ["violence", "violent", "عنف", "عنيف", "graphic violence", "domestic violence", "self-defense", "self defense", "justified violence", "documentary violence", "violence event", "violence threat", "violence attempt", "violence glorification", "violence encouragement", "violence instruction", "violence reward", "violence revenge", "violence self defense", "violence law enforcement", "violence accident", "violence negligence", "violence condemnation", "violence documentary", "violence historical", "violence training", "violence game", "violence fantasy", "violence comedy", "violence dream", "violence flashback", "violence memory", "violence imagination", "violence failed attempt", "violence offscreen", "violence scene description", "violence dialogue", "violence reported by character", "violence observed", "violence implied", "murder", "torture", "kill", "قتل", "طعن", "ضرب", "اعتداء", "تعذيب", "weapon", "weapons", "knife", "gun", "pistol", "rifle", "سلاح", "سكاكين", "مسدس", "بندقية"])) {
    concepts.add("violence");
    concepts.add("violence_event");
    if (hasAny(evidenceText, ["threat", "violence threat", "violence_threat", "سأقتلك", "سأضربك", "سأطعنك", "هدده", "هددها", "هددوه", "تهديد", "يهدد", "يهددها", "يهدده"])) {
      concepts.add("violence_threat");
    }
    if (hasAny(evidenceText, ["attempt", "violence attempt", "violence_attempt", "حاول", "يحاول", "failed attempt", "فشل", "failed to kill", "failed to attack"])) {
      concepts.add("violence_attempt");
    }
  }
  if (hasAny(evidenceText, ["طفل", "طفلة", "قاصر", "minor", "child", "children", "infant", "teenager", "vulnerable person", "vulnerable_person", "disabled child", "disabled_child", "disabled adult", "disabled_adult", "elderly person", "elderly_person"])) {
    concepts.add("child");
    concepts.add("minor");
    concepts.add("infant");
    concepts.add("teenager");
    concepts.add("vulnerable_person");
  }
  if (hasAny(evidenceText, ["إساءة", "abuse", "يضرب الطفل", "يضرب القاصر", "beat the child", "hit the child", "ترك الطفل", "ترك القاصر", "abandonment", "استغل الطفل", "استغلال الطفل", "exploit", "grooming", "استدرج الطفل", "threaten the child", "bullying", "humiliation", "fear induction", "isolation", "mocking disability", "disability abuse", "forced the child to steal", "forced the child to smuggle", "child crime", "criminal exploitation", "trafficking", "يسخرون", "يسخر من الطفل", "يذلونه", "إذلال", "إهانة", "تنمر", "يخيف الطفل", "خوف الطفل", "يرهب الطفل"])) {
    concepts.add("grooming");
    concepts.add("exploitation");
    concepts.add("bullying");
    concepts.add("humiliation");
    concepts.add("fear_induction");
    concepts.add("isolation");
    concepts.add("abuse");
    concepts.add("neglect");
  }
  if (hasAny(evidenceText, ["إرهاب", "إرهابي", "متطرف", "تطرف", "extremism", "terrorism", "داعش", "القاعدة"])) {
    concepts.add("terrorism");
    concepts.add("extremism");
  }
  if (hasAny(evidenceText, ["جندوا", "جند", "يجند", "تجنيد", "انضموا", "بايعوا", "recruit", "recruitment"])) {
    concepts.add("recruitment");
    concepts.add("banned_group");
  }
  if (hasAny(evidenceText, ["sabotage", "تخريب", "تفجير", "destroy", "disable", "قطع الاتصالات"])) {
    concepts.add("sabotage");
  }
  if (hasAny(evidenceText, ["cyber", "اختراق", "hacking", "hack", "ddos", "attack", "attack", "malware", "breach"])) {
    concepts.add("cyber_attack");
  }
  if (hasAny(evidenceText, ["سربوا", "سرب", "كشفوا", "كشف", "أسرار عسكرية", "معلومات سرية", "classified", "secret", "military disclosure", "leak"])) {
    concepts.add("military_disclosure");
    concepts.add("confidential_information");
  }
  if (hasAny(evidenceText, ["شغب", "فوضى", "riot", "riots", "civil unrest", "public disorder", "mass panic"])) {
    concepts.add("public_order");
    concepts.add("riot");
    concepts.add("civil_unrest");
  }

  return Object.freeze([...concepts].sort((left, right) => left.localeCompare(right)));
}

function inferDomains(intelligence: IntelligenceContext): readonly string[] {
  const concepts = new Set(inferConcepts(intelligence).map((concept) => normalizeText(concept)));
  const targetText = normalizeText([
    intelligence.target ?? "",
    intelligence.victim ?? "",
    intelligence.semantic.target ?? "",
    intelligence.semantic.victim ?? "",
    ...intelligence.entities
      .filter((entity) => entity.role === "target" || entity.role === "victim")
      .map((entity) => entity.label),
  ].join(" "));
  const evidenceText = normalizeText([
    intelligence.semantic.semanticMeaning,
    intelligence.context.localContext,
    intelligence.context.narrativeContext,
    intelligence.context.chunkContext,
    intelligence.storyMemory ?? "",
    intelligence.evidenceAssessment.primaryText,
  ].join(" "));
  const domains = new Set<string>();

  if (concepts.has("profanity")) domains.add("society");
  if ([..."security terrorism extremism overthrow coup public_order riot civil_unrest state_security national_security".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("security");
    domains.add("politics");
  }
  if ([..."religion prophet holy_book sanctity religious_symbol religious_unity religious_ritual mosque".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("religion");
  }
  if ([..."child infant teenager minor disabled_child vulnerable_person grooming exploitation bullying".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("children");
  }
  if ([..."violence violence_event violence_threat violence_attempt violence_glorification violence_encouragement".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("violence");
  }
  if ([..."sexual_reference sexual_description sexual_scene sexual_clothing sexual_camera_focus sexual_body_focus sexual_normalization".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("sexuality");
  }
  if ([..."drug_reference drug_consumption drug_possession drug_distribution drug_sale drug_manufacturing drug_dependency drug_addiction medical_drug_use prescription_drug_use".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("drugs");
  }
  if ([..."crime_reference crime_attempt crime_conspiracy crime_planning crime_execution crime_bribery crime_corruption crime_money_laundering crime_kidnapping crime_hostage crime_murder crime_assault".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("crime");
  }
  if ([..."state_reference government_reference head_of_state royal_family government_institution public_official foreign_government foreign_leader international_organization national_flag national_anthem national_symbol national_identity".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("politics");
  }
  if (concepts.has("military_disclosure") || concepts.has("confidential_information") || hasAny(evidenceText, ["أسرار عسكرية", "معلومات سرية", "classified", "secret", "military disclosure", "leak"])) {
    domains.add("security");
    domains.add("politics");
  }
  if (/[رر]ئيس|حكومة|دولة|ملك|أمير|زعيم|حاكم|وزارة|برلمان|مجلس|government|president|state|king|leader|minister/.test(targetText) || hasAny(evidenceText, ["الرئيس", "الحكومة", "الدولة", "الملك", "الأمير", "الزعيم", "الحاكم", "الوزارة", "البرلمان", "government", "president", "state", "king", "leader", "minister"])) {
    domains.add("politics");
    domains.add("security");
  }
  if ([..."historical_person historical_leader historical_event historical_battle historical_conflict historical_documentary historical_education historical_reference historical_quote historical_narration alternate_history historical_fiction".split(" ")].some((concept) => concepts.has(concept))) {
    domains.add("history");
  }

  return Object.freeze([...domains].sort((left, right) => left.localeCompare(right)));
}

function inferTargets(intelligence: IntelligenceContext): readonly string[] {
  const evidenceText = normalizeText([
    intelligence.semantic.semanticMeaning,
    intelligence.context.localContext,
    intelligence.context.narrativeContext,
    intelligence.context.chunkContext,
    intelligence.storyMemory ?? "",
    intelligence.evidenceAssessment.primaryText,
  ].join(" "));
  const inferredTargets = [
    intelligence.target ?? "",
    intelligence.victim ?? "",
    intelligence.semantic.target ?? "",
    intelligence.semantic.victim ?? "",
    ...intelligence.entities
      .filter((entity) => entity.role === "target" || entity.role === "victim")
      .map((entity) => entity.label),
  ];
  if (hasAny(evidenceText, ["التنظيم", "group", "organization", "جماعة", "متطرف", "terror", "extremist", "recruitment"])) {
    inferredTargets.push("group");
  }
  if (hasAny(evidenceText, ["الجيش", "عسكري", "military", "السرية", "secret", "classified", "أسرار عسكرية", "معلومات سرية"])) {
    inferredTargets.push("military");
    inferredTargets.push("information");
    inferredTargets.push("state");
  }
  if (hasAny(evidenceText, ["violence", "violent", "graphic violence", "domestic violence", "self-defense", "self defense", "justified violence", "documentary violence", "murder", "torture", "kill", "قتل", "طعن", "ضرب", "اعتداء", "تعذيب", "weapon", "weapons", "knife", "gun", "pistol", "rifle", "سلاح", "سكاكين", "مسدس", "بندقية", "سأقتلك", "هدده", "هددها", "هددوه"])) {
    inferredTargets.push("person");
  }
  if (hasAny(evidenceText, ["الحكومة", "الدولة", "الرئاسة", "government", "state", "public order", "riot", "فوضى"])) {
    inferredTargets.push("state");
    inferredTargets.push("government");
    inferredTargets.push("public");
  }
  return uniqueSorted(inferredTargets);
}

function inferActions(intelligence: IntelligenceContext): readonly string[] {
  const concepts = intelligence.conceptContext.conceptIds.map((concept) => normalizeText(concept));
  const evidenceText = intelligence.evidenceAssessment.primaryText;
  const narrativeIntent = normalizeText(intelligence.narrative.narrativeIntent);
  const semanticIntent = normalizeText(intelligence.semantic.narrativeIntent);
  const reason = normalizeText(intelligence.semantic.semanticMeaning);
  const actions = new Set<string>();

  if (concepts.includes("profanity") || hasAny(evidenceText, ["يا كلب", "يا حمار", "يا خرا", "يا نصاب", "سباب", "شتيمة", "insult", "mockery"])) {
    actions.add("insult");
    actions.add("mockery");
  }
  if (concepts.some((concept) => concept.includes("violence")) || hasAny(reason, ["قتل", "اضرب", "سأقتلك", "threat", "kill"])) {
    actions.add("threat");
    actions.add("intimidation");
  }
  if (concepts.some((concept) => concept.includes("religion")) || hasAny(reason, ["إهان", "mock", "desecration", "holy"])) {
    actions.add("insult");
    actions.add("desecration");
  }
  if (concepts.some((concept) => concept.includes("child")) || hasAny(reason, ["طفل", "minor", "groom", "abuse"])) {
    actions.add("abuse");
    actions.add("grooming");
  }
  if (concepts.some((concept) => concept.includes("drug")) || hasAny(reason, ["مخدر", "drug", "alcohol", "smoking"])) {
    actions.add("use");
    actions.add("promotion");
  }
  if (concepts.some((concept) => concept.includes("crime")) || hasAny(reason, ["رشوة", "corruption", "bribery", "fraud", "smuggle"])) {
    actions.add("bribery");
    actions.add("corruption");
  }
  if (concepts.some((concept) => concept.includes("recruitment") || concept.includes("terrorism") || concept.includes("extremism") || concept.includes("banned_group")) || hasAny(reason, ["تجنيد", "جندوا", "انضموا", "بايعوا", "recruit", "recruitment", "extremism", "terrorism"])) {
    actions.add("recruitment");
    actions.add("promotion");
    actions.add("glorification");
    actions.add("support");
  }
  if (concepts.some((concept) => concept.includes("sabotage")) || hasAny(reason, ["sabotage", "تخريب", "تفجير", "تعطيل"])) {
    actions.add("sabotage");
    actions.add("attack");
    actions.add("damage");
  }
  if (concepts.some((concept) => concept.includes("cyber_attack")) || hasAny(reason, ["cyber", "اختراق", "hacking", "hack", "ddos", "breach"])) {
    actions.add("cyber_attack");
    actions.add("attack");
    actions.add("breach");
  }
  if (concepts.some((concept) => concept.includes("military_disclosure") || concept.includes("confidential_information")) || hasAny(reason, ["سربوا", "سرب", "كشفوا", "أسرار عسكرية", "معلومات سرية", "classified", "secret", "disclosure", "leak"])) {
    actions.add("disclosure");
    actions.add("leak");
    actions.add("expose");
  }
  if (concepts.some((concept) => concept === "government" || concept === "military") || hasAny(reason, ["الدولة", "الحكومة", "الرئيس", "الملك", "الأمير", "الزعيم", "الحاكم"])) {
    if (hasAny(reason, ["كذاب", "فاسد", "غبي", "أحمق", "خائن", "حقير", "تافه", "سخيف", "فاشل", "مخزي", "محتال"])) {
      actions.add("insult");
      actions.add("mockery");
    }
    if (hasAny(reason, ["اسقطوا", "اقلبوا", "اطيح", "أطيح", "تمردوا", "ثوروا", "اهتفوا ضد", "احرقوا"])) {
      actions.add("incitement");
      actions.add("propaganda");
      actions.add("support");
      actions.add("glorification");
    }
  }
  if (narrativeIntent === "condemnation" || semanticIntent === "condemnation") actions.add("condemnation");
  if (narrativeIntent === "education" || semanticIntent === "education") actions.add("instruction");

  return Object.freeze([...actions].sort((left, right) => left.localeCompare(right)));
}

function inferIntents(intelligence: IntelligenceContext): readonly string[] {
  const intents = new Set<string>();
  const narrativeIntent = normalizeText(intelligence.narrative.narrativeIntent);
  const semanticIntent = normalizeText(intelligence.semantic.narrativeIntent);
  const interpretationMode = normalizeText(intelligence.interpretationMode);

  if (narrativeIntent) intents.add(narrativeIntent);
  if (semanticIntent) intents.add(semanticIntent);
  if (interpretationMode) intents.add(interpretationMode);
  if (intelligence.flags.quotation) intents.add("quotation");
  if (intelligence.flags.educational) intents.add("educational");
  if (intelligence.flags.documentary) intents.add("documentary");
  if (intelligence.flags.historical) intents.add("historical");
  if (intelligence.flags.dream) intents.add("dream");
  if (intelligence.flags.flashback) intents.add("flashback");
  if (intelligence.flags.comedy) intents.add("comedy");
  if (intelligence.flags.satire) intents.add("satire");
  if (intelligence.flags.threat) intents.add("threat");
  if (intelligence.flags.promotion) intents.add("promotion");
  if (intelligence.flags.condemnation) intents.add("condemnation");
  if (intelligence.flags.neutrality) intents.add("neutral");

  return uniqueSorted([...intents]);
}

function inferContexts(intelligence: IntelligenceContext): readonly string[] {
  const contexts = new Set<string>();
  contexts.add(normalizeText(intelligence.context.narrativeContext || "narrative") || "narrative");
  contexts.add(normalizeText(intelligence.semantic.sceneRole || "unknown") || "unknown");
  contexts.add(normalizeText(intelligence.narrative.sceneType || "unknown") || "unknown");
  if (intelligence.flags.dialogue) contexts.add("dialogue");
  if (intelligence.flags.narration) contexts.add("narration");
  if (intelligence.flags.description) contexts.add("scene_description");
  if (intelligence.flags.educational) contexts.add("educational");
  if (intelligence.flags.documentary) contexts.add("documentary");
  if (intelligence.flags.historical) contexts.add("historical");
  if (intelligence.flags.fiction) contexts.add("fiction");
  if (intelligence.flags.dream) contexts.add("dream");
  if (intelligence.flags.flashback) contexts.add("flashback");
  if (intelligence.flags.quotation) contexts.add("quotation");
  if (intelligence.flags.news) contexts.add("news");
  if (intelligence.flags.comedy) contexts.add("comedy");
  if (intelligence.flags.satire) contexts.add("satire");

  return uniqueSorted([...contexts]);
}

export function buildRuntimeGcamMapperInput(decision: LegalDecision, intelligence: IntelligenceContext): GcamMapperInput {
  return Object.freeze({
    concepts: uniqueSorted(inferConcepts(intelligence)),
    domains: inferDomains(intelligence),
    targets: inferTargets(intelligence),
    actions: inferActions(intelligence),
    intents: inferIntents(intelligence),
    contexts: inferContexts(intelligence),
    evidence: uniqueSorted(decision.evidence.candidates.map((candidate) => candidate.text)),
    reviewerJudgment: decision.status,
    confidence: Number((Math.max(0, Math.min(1, decision.confidence)) * 100).toFixed(3)),
  });
}

export function evaluateRuntimeGcamMapping(
  decision: LegalDecision,
  intelligence: IntelligenceContext,
  registry: GcamMapperRegistry = DEFAULT_GCAM_MAPPER_REGISTRY,
): GcamMapperResult {
  return registry.map(buildRuntimeGcamMapperInput(decision, intelligence));
}

function inferSeverity(status: LegalDecision["status"], confidence: number): V3RuntimeFinding["severity"] {
  if (status === "reject") return "low";
  if (confidence >= 0.95) return "high";
  if (confidence >= 0.8) return "medium";
  return "low";
}

function buildLocation(
  evidence: LegalEvidenceCandidate,
  chunkStart: number,
  startLine: number | null,
  endLine: number | null,
  diagnostics: V3RuntimeDiagnostics,
  moduleId: string,
): JudgeFinding["location"] & { v3: Record<string, unknown> } {
  const startOffset = clampOffset(evidence.startOffset, chunkStart);
  const endOffset = clampOffset(evidence.endOffset, Math.max(startOffset, chunkStart));
  return {
    start_offset: startOffset,
    end_offset: endOffset,
    start_line: startLine,
    end_line: endLine,
    v3: {
      engine_version: diagnostics.engineVersion,
      prompt_hash: diagnostics.promptHash,
      semantic_hash: diagnostics.semanticHash,
      legal_hash: diagnostics.legalHash,
      raw_response_hash: diagnostics.rawResponseHash,
      execution_signature_hash: diagnostics.executionSignatureHash,
      provider_name: diagnostics.providerName,
      model_name: diagnostics.modelName,
      model_version: diagnostics.modelVersion,
      response_id: diagnostics.responseId,
      response_timestamp: diagnostics.responseTimestamp,
      finding_count: diagnostics.findingCount,
      category: moduleId,
      reviewer_metadata: {
        reviewed_by: null,
        reviewed_at: null,
        edited_by: null,
        edited_at: null,
      },
    },
  };
}

export function mapLegalDecisionToFindings(args: {
  decision: LegalDecision;
  reasonedDecision?: V3ReasonedDecisionResult | null;
  chunkStart: number;
  chunkEnd: number;
  startLine: number | null;
  endLine: number | null;
  diagnostics: V3RuntimeDiagnostics;
  gcamMapping?: GcamMapperResult | null;
}): V3RuntimeFinding[] {
  const { decision, reasonedDecision, chunkStart, chunkEnd, startLine, endLine, diagnostics, gcamMapping } = args;
  const sourceEvaluations = Array.isArray(reasonedDecision?.articleEvaluations) && reasonedDecision.articleEvaluations.length > 0
    ? reasonedDecision.articleEvaluations
    : decision.finding
      ? [{
          articleId: decision.finding.articleIds[0] ?? decision.articleIds[0] ?? 0,
          status: "PASS" as const,
          evidence: [decision.finding.evidence.text],
          reason: decision.finding.reason,
          confidence: decision.finding.confidence,
        }]
      : [];
  const passEvaluations = sourceEvaluations.filter((evaluation) => evaluation.status === "PASS" && Number.isFinite(Number(evaluation.articleId)) && Number(evaluation.articleId) > 0);

  if (passEvaluations.length === 0) {
    logger.info("V3 finding mapper rejected decision", {
      decision_status: decision.status,
      decision_article: decision.finding?.articleIds[0] ?? decision.articleIds[0] ?? (reasonedDecision?.applicableArticles[0] ?? null),
      decision_atom: gcamMapping?.status === "MAPPED" ? gcamMapping.atomId : null,
      decision_reason: decision.reason,
      validator_history: decision.trace,
      line_of_code: "findingMapper.ts:419-421",
      reasoned_decision_article_evaluations: reasonedDecision?.articleEvaluations.length ?? 0,
    });
    return [];
  }

  return passEvaluations.flatMap((evaluation, index) => {
    const articleId = Number(evaluation.articleId);
    const policyAssessment = evaluatePolicyDisposition(decision, evaluation);
    const mappedArticleId = gcamMapping?.status === "MAPPED" ? gcamMapping.articleId : null;
    const mappedAtomId = gcamMapping?.status === "MAPPED" && mappedArticleId === articleId
      ? gcamMapping.atomId
      : null;
    const fallbackAtomId = getPolicyAtomIdsForArticle(articleId)[0] ?? null;
    const atomId = normalizeAtomId(mappedAtomId ?? fallbackAtomId ?? null, articleId) || null;
    const canonicalAtom = getPrimaryCanonicalAtomForGcam(articleId, atomId);
    const primaryEvidence = pickEvaluationEvidence(decision, evaluation.evidence);
    const evidenceSnippet = String(primaryEvidence?.text ?? evaluation.evidence[0] ?? "").trim();
    const locationEvidence = primaryEvidence ?? pickPrimaryEvidence(decision) ?? decision.evidence.candidates[0] ?? {
      text: evidenceSnippet,
      startOffset: chunkStart,
      endOffset: Math.max(chunkStart + evidenceSnippet.length, chunkStart + 1),
      confidence: decision.evidence.confidence,
      source: "chunk" as const,
      notes: [],
    };
    const location = buildLocation(locationEvidence, chunkStart, startLine, endLine, diagnostics, decision.moduleId);

    return [{
      source: "v3",
      exists: true,
      article_id: articleId,
      atom_id: atomId,
      severity: inferSeverity(evaluation.status === "PASS" ? "accept" : "needs_review", evaluation.confidence),
      confidence: Number(Math.max(0, Math.min(1, evaluation.confidence)).toFixed(6)),
      title_ar: gcamMapping?.findingTitle ?? decision.moduleTitle,
      description_ar: gcamMapping?.reviewerExplanation ?? evaluation.reason ?? decision.reason,
      evidence_snippet: evidenceSnippet,
      rationale_ar: evaluation.reason ?? decision.reason,
      exceptionApplied: policyAssessment.disposition === "exception_applied",
      exceptionType: policyAssessment.exceptionCodes[0] ?? decision.finding?.exceptionType ?? null,
      exceptionReason: policyAssessment.reasons.join(" | ") || decision.finding?.exceptionReason || null,
      recommendedAction: decision.status === "needs_review" ? "Needs Review" : "Approve",
      legalRecommendation: decision.finding?.legalRecommendation ?? (decision.status === "needs_review" ? "Needs Review" : "Approve"),
      final_ruling: "violation",
      detection_pass: `v3_runtime_${decision.moduleId}`,
      location,
      start_offset_global: clampOffset(primaryEvidence?.startOffset, chunkStart),
      end_offset_global: clampOffset(primaryEvidence?.endOffset, chunkStart),
      canonical_atom: canonicalAtom ?? derivePolicyConceptCode(articleId, atomId),
      lineage_id: null,
      parent_lineage_id: null,
      evidence_hash: null,
      canonical_hash: null,
      is_interpretive: evaluation.status === "needs_review",
      depiction_type: "unknown",
      speaker_role: "unknown",
      narrative_consequence: "unknown",
      context_window_id: null,
      context_confidence: decision.context.confidence,
      lexical_confidence: decision.evidence.confidence,
      policy_confidence: decision.semantic.confidence,
      policy_links: [
        {
          article_id: articleId,
          atom_concept_id: canonicalAtom ?? null,
          role: policyAssessment.disposition,
        },
      ],
      primary_article_id: articleId,
      related_article_ids: [...new Set([articleId, ...(gcamMapping?.status === "MAPPED" && gcamMapping.articleId !== null ? [gcamMapping.articleId] : [])])].sort((left, right) => left - right),
    }];
  });
}

export function summarizeContextForReport(context: LegalContextResult): Record<string, unknown> {
  return {
    story_memory: context.storyMemory,
    scene_memory: context.sceneMemory,
    local_context: context.localContext,
    chunk_context: context.chunkContext,
    neighboring_sentences: [...context.neighboringSentences],
    narrative_context: context.narrativeContext,
    confidence: context.confidence,
  };
}
