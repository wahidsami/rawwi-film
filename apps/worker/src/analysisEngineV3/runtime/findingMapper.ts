import { getPrimaryCanonicalAtomForGcam } from "../../canonicalAtomMapping.js";
import { derivePolicyConceptCode, getPolicyAtomIdsForArticle, normalizeAtomId } from "../../policyMap.js";
import type { JudgeFinding } from "../../schemas.js";
import type { LegalDecision } from "../legal/legalDecision.js";
import type { LegalEvidenceCandidate, LegalContextResult } from "../legal/legalTypes.js";
import type { IntelligenceContext } from "../intelligence/intelligenceContext.js";
import { createGcamMapperRegistry } from "../reviewerKnowledge/gcamMapper/index.js";
import type {
  GcamMapperInput,
  GcamMapperRegistry,
  GcamMapperResult,
} from "../reviewerKnowledge/gcamMapper/schemas/gcamMapperTypes.js";
import type { V3RuntimeDiagnostics } from "./runtimeDiagnostics.js";
import type { V3RuntimeFinding } from "./runtimeTypes.js";

const DEFAULT_GCAM_MAPPER_REGISTRY = createGcamMapperRegistry();

function clampOffset(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function pickPrimaryEvidence(decision: LegalDecision): LegalEvidenceCandidate | null {
  if (decision.evidence.primaryCandidateIndex === null) return null;
  return decision.evidence.candidates[decision.evidence.primaryCandidateIndex] ?? null;
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
  chunkStart: number;
  chunkEnd: number;
  startLine: number | null;
  endLine: number | null;
  diagnostics: V3RuntimeDiagnostics;
  gcamMapping?: GcamMapperResult | null;
}): V3RuntimeFinding[] {
  const { decision, chunkStart, chunkEnd, startLine, endLine, diagnostics, gcamMapping } = args;
  if (!decision.finding || decision.status === "reject") return [];

  const primaryEvidence = pickPrimaryEvidence(decision) ?? decision.finding.evidence;
  const mappedArticleId = gcamMapping?.status === "MAPPED" ? gcamMapping.articleId : null;
  const articleId = mappedArticleId ?? decision.finding.articleIds[0] ?? decision.articleIds[0] ?? 0;
  const mappedAtomId = gcamMapping?.status === "MAPPED" ? gcamMapping.atomId : null;
  const fallbackAtomId = getPolicyAtomIdsForArticle(articleId)[0] ?? null;
  const atomId = normalizeAtomId(mappedAtomId ?? fallbackAtomId ?? null, articleId) || null;
  const canonicalAtom = getPrimaryCanonicalAtomForGcam(articleId, atomId);
  const evidenceSnippet = String(primaryEvidence?.text ?? "").trim();
  const location = buildLocation(primaryEvidence ?? decision.finding.evidence, chunkStart, startLine, endLine, diagnostics, decision.moduleId);

  return [
    {
      source: "ai",
      article_id: articleId,
      atom_id: atomId,
      severity: inferSeverity(decision.status, decision.confidence),
      confidence: Number(Math.max(0, Math.min(1, decision.confidence)).toFixed(6)),
      title_ar: gcamMapping?.findingTitle ?? decision.moduleTitle,
      description_ar: gcamMapping?.reviewerExplanation ?? decision.reason,
      evidence_snippet: evidenceSnippet,
      rationale_ar: decision.reason,
      final_ruling: decision.status === "accept" ? "violation" : "needs_review",
      detection_pass: `v3_runtime_${decision.moduleId}`,
      location,
      start_offset_global: clampOffset(primaryEvidence?.startOffset, chunkStart),
      end_offset_global: clampOffset(primaryEvidence?.endOffset, chunkStart),
      canonical_atom: canonicalAtom ?? derivePolicyConceptCode(articleId, atomId),
      lineage_id: null,
      parent_lineage_id: null,
      evidence_hash: null,
      canonical_hash: null,
      is_interpretive: decision.status === "needs_review",
      depiction_type: "unknown",
      speaker_role: "unknown",
      narrative_consequence: "unknown",
      context_window_id: null,
      context_confidence: decision.context.confidence,
      lexical_confidence: decision.evidence.confidence,
      policy_confidence: decision.semantic.confidence,
      primary_article_id: articleId,
      related_article_ids: [...new Set([...(decision.finding.articleIds ?? []), ...(gcamMapping?.status === "MAPPED" && gcamMapping.articleId !== null ? [gcamMapping.articleId] : [])])].sort((left, right) => left - right),
    },
  ];
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
