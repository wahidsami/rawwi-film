import { derivePolicyConceptCode, getPolicyArticle, getPolicyAtomIdsForArticle, getPolicyAtomTitle, getScannableArticleIds } from "../policyMap.js";
import { createDefaultReviewerKnowledgeRegistry, resolveKnowledgeDomainCandidateArticleIds } from "../analysisEngineV3/reviewerKnowledge/reviewerKnowledgeRegistry.js";
import type {
  SceneAnalysisArticleCandidate,
  SceneAnalysisAtomCandidate,
  SceneAnalysisConcept,
  SceneAnalysisEvidenceSpan,
  SceneAnalysisExplanation,
  SceneAnalysisSentence,
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

const GENERAL_DOMAIN = "general";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function splitSentences(sceneText: string): readonly SceneAnalysisSentence[] {
  const sentences: SceneAnalysisSentence[] = [];
  const text = sceneText.trim();
  if (text.length === 0) {
    return Object.freeze(sentences);
  }

  const delimiter = /[.!?؟\n]+/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = delimiter.exec(text)) !== null) {
    const raw = text.slice(cursor, match.index).trim();
    if (raw.length > 0) {
      const startOffset = text.indexOf(raw, cursor);
      const endOffset = startOffset + raw.length;
      sentences.push(Object.freeze({
        sentenceId: `sentence-${index + 1}`,
        text: raw,
        startOffset,
        endOffset,
        sourceType: inferSourceType(raw),
      }));
      index += 1;
    }
    cursor = match.index + match[0].length;
  }

  const tail = text.slice(cursor).trim();
  if (tail.length > 0) {
    const startOffset = text.indexOf(tail, cursor);
    const endOffset = startOffset + tail.length;
    sentences.push(Object.freeze({
      sentenceId: `sentence-${index + 1}`,
      text: tail,
      startOffset,
      endOffset,
      sourceType: inferSourceType(tail),
    }));
  }

  return Object.freeze(sentences);
}

function inferSourceType(sentence: string): SceneAnalysisSentence["sourceType"] {
  if (/[:«»"“”']/u.test(sentence) || /^\s*[-–]/u.test(sentence) || /\b(?:قال|تقول|يقول|رد|سأل|أجاب)\b/u.test(sentence)) {
    return "dialogue";
  }
  if (/\b(?:داخلي|خارجي|ليل|نهار|غرفة|شارع|بيت|مشهد|فصل)\b/u.test(sentence)) {
    return "scene_description";
  }
  return "story_context";
}

function collectEvidenceSpans(sentences: readonly SceneAnalysisSentence[]): readonly SceneAnalysisEvidenceSpan[] {
  return Object.freeze(sentences.map((sentence, index) => Object.freeze({
    spanId: `evidence-${index + 1}`,
    text: sentence.text,
    startOffset: sentence.startOffset,
    endOffset: sentence.endOffset,
    sentenceIndex: index,
    sourceType: sentence.sourceType,
    conceptIds: Object.freeze([]),
    confidence: 1,
    rationale: Object.freeze([`Sentence ${index + 1} is the grounded evidence span.`]),
  })));
}

function countEvidenceSignals(text: string): number {
  const normalized = normalizeText(text);
  let score = 0;
  for (const definition of CONCEPT_DEFINITIONS) {
    if (definition.pattern.test(normalized) || definition.pattern.test(text)) {
      score += 1;
    }
  }
  return score;
}

function selectPrimaryEvidenceSpan(spans: readonly SceneAnalysisEvidenceSpan[]): SceneAnalysisEvidenceSpan | null {
  if (spans.length === 0) {
    return null;
  }

  return [...spans].sort((left, right) => {
    const leftSignals = countEvidenceSignals(left.text);
    const rightSignals = countEvidenceSignals(right.text);
    if (rightSignals !== leftSignals) {
      return rightSignals - leftSignals;
    }
    if (left.text.length !== right.text.length) {
      return left.text.length - right.text.length;
    }
    return left.startOffset - right.startOffset;
  })[0] ?? null;
}

function scoreConcept(definition: ConceptDefinition, spans: readonly SceneAnalysisEvidenceSpan[]): SceneAnalysisConcept | null {
  const matchingSpanIds = spans.filter((span) => definition.pattern.test(normalizeText(span.text)) || definition.pattern.test(span.text)).map((span) => span.spanId);
  if (matchingSpanIds.length === 0) {
    return null;
  }

  const evidenceStrength = Math.min(1, 0.6 + (matchingSpanIds.length * 0.12));
  return Object.freeze({
    conceptId: definition.conceptId,
    label: definition.label,
    knowledgeDomains: uniqueSorted(definition.domains),
    evidenceSpanIds: Object.freeze(matchingSpanIds),
    confidence: Number(evidenceStrength.toFixed(6)),
    rationale: Object.freeze([
      `Matched ${definition.label} with ${matchingSpanIds.length} grounded evidence span(s).`,
    ]),
  });
}

function conceptDomains(concepts: readonly SceneAnalysisConcept[]): readonly string[] {
  const domains = new Set<string>();
  for (const concept of concepts) {
    for (const domain of concept.knowledgeDomains) {
      domains.add(domain);
    }
  }
  if (domains.size === 0) {
    return Object.freeze([GENERAL_DOMAIN]);
  }
  return uniqueSorted([...domains]);
}

function buildArticleCandidate(
  articleId: number,
  matchedDomains: readonly string[],
  matchedConcepts: readonly SceneAnalysisConcept[],
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[],
): SceneAnalysisArticleCandidate | null {
  const policyArticle = getPolicyArticle(articleId);
  if (!policyArticle) {
    return null;
  }

  const matchedConceptIds = matchedConcepts.filter((concept) => concept.knowledgeDomains.some((domain) => matchedDomains.includes(domain))).map((concept) => concept.conceptId);
  const spanIds = matchedConcepts.flatMap((concept) => concept.evidenceSpanIds).filter((spanId) => evidenceSpans.some((span) => span.spanId === spanId));
  const evidenceCount = new Set(spanIds).size;
  const domainScore = matchedDomains.length * 100;
  const conceptScore = matchedConceptIds.length * 17;
  const evidenceScore = evidenceCount * 11;
  const titleScore = matchedConceptIds.some((conceptId) => normalizeText(policyArticle.title_ar).includes(conceptId)) ? 9 : 0;
  const score = domainScore + conceptScore + evidenceScore + titleScore - (articleId / 1000);

  return Object.freeze({
    articleId,
    titleAr: policyArticle.title_ar,
    matchedKnowledgeDomains: uniqueSorted(matchedDomains),
    matchedConceptIds: uniqueSorted(matchedConceptIds),
    evidenceSpanIds: uniqueSorted(spanIds),
    score: Number(score.toFixed(6)),
    rationale: Object.freeze([
      `Matched domains: ${matchedDomains.join(", ") || "none"}.`,
      `Matched concepts: ${matchedConceptIds.join(", ") || "none"}.`,
      `Grounded evidence count: ${evidenceCount}.`,
    ]),
  });
}

function resolveArticlesFromDomains(
  domains: readonly string[],
  concepts: readonly SceneAnalysisConcept[],
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[],
): readonly SceneAnalysisArticleCandidate[] {
  const registry = createDefaultReviewerKnowledgeRegistry();
  const resolved = new Map<number, SceneAnalysisArticleCandidate>();
  const activeDomains = domains.length > 0 ? domains : [GENERAL_DOMAIN];

  for (const domain of activeDomains) {
    const candidateArticleIds = resolveKnowledgeDomainCandidateArticleIds(registry, domain);
    for (const articleId of candidateArticleIds) {
      const candidate = buildArticleCandidate(articleId, [domain], concepts, evidenceSpans);
      if (!candidate) continue;
      const existing = resolved.get(articleId);
      if (!existing || candidate.score > existing.score) {
        resolved.set(articleId, candidate);
      }
    }
  }

  if (resolved.size === 0) {
    for (const articleId of getScannableArticleIds()) {
      const candidate = buildArticleCandidate(articleId, activeDomains, concepts, evidenceSpans);
      if (candidate) {
        resolved.set(articleId, candidate);
      }
    }
  }

  return Object.freeze([...resolved.values()].sort((left, right) => right.score - left.score || left.articleId - right.articleId));
}

function rankCandidateArticles(candidates: readonly SceneAnalysisArticleCandidate[]): readonly SceneAnalysisArticleCandidate[] {
  return Object.freeze([...candidates].sort((left, right) => right.score - left.score || left.articleId - right.articleId));
}

function buildAtomCandidate(
  article: SceneAnalysisArticleCandidate,
  atomId: string,
  atomTitleAr: string | undefined,
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[],
  conceptIds: readonly string[],
  rankIndex: number,
): SceneAnalysisAtomCandidate {
  const conceptBonus = conceptIds.some((conceptId) => normalizeText(atomTitleAr ?? "").includes(conceptId)) ? 7 : 0;
  const evidenceBonus = evidenceSpans.length * 3;
  const score = article.score + conceptBonus + evidenceBonus - (rankIndex * 0.05);
  return Object.freeze({
    articleId: article.articleId,
    articleTitleAr: article.titleAr,
    atomId,
    atomTitleAr: atomTitleAr ?? `Atom ${atomId}`,
    canonicalAtomCode: derivePolicyConceptCode(article.articleId, atomId),
    evidenceSpanIds: article.evidenceSpanIds,
    score: Number(score.toFixed(6)),
    rationale: Object.freeze([
      `Derived from article ${article.articleId} (${article.titleAr}).`,
      `Matched concepts: ${conceptIds.join(", ") || "none"}.`,
      `Grounded evidence spans: ${article.evidenceSpanIds.join(", ") || "none"}.`,
    ]),
  });
}

function resolveAtomsFromArticles(
  rankedArticles: readonly SceneAnalysisArticleCandidate[],
  concepts: readonly SceneAnalysisConcept[],
  evidenceSpans: readonly SceneAnalysisEvidenceSpan[],
): readonly SceneAnalysisAtomCandidate[] {
  const atoms: SceneAnalysisAtomCandidate[] = [];
  const conceptIds = rankedArticles.flatMap((article) => article.matchedConceptIds);

  for (const article of rankedArticles) {
    const atomIds = getPolicyAtomIdsForArticle(article.articleId);
    for (const [index, atomId] of atomIds.entries()) {
      const atomTitle = getPolicyAtomTitle(article.articleId, atomId);
      atoms.push(buildAtomCandidate(article, atomId, atomTitle, evidenceSpans, conceptIds, index));
    }
  }

  return Object.freeze([...atoms].sort((left, right) => right.score - left.score || left.canonicalAtomCode.localeCompare(right.canonicalAtomCode)));
}

function composeExplanation(
  evidence: SceneAnalysisEvidenceSpan | null,
  article: SceneAnalysisArticleCandidate | null,
  atom: SceneAnalysisAtomCandidate | null,
  concepts: readonly SceneAnalysisConcept[],
): SceneAnalysisExplanation {
  const groundedEvidence = evidence?.text ?? "";
  const conceptSummary = concepts.map((concept) => concept.label).join(", ") || "none";
  const rationale = [
    article ? `Primary article ${article.articleId} (${article.titleAr}) selected from the detected domains.` : "No primary article selected.",
    atom ? `Primary atom ${atom.atomId} (${atom.atomTitleAr}) selected from the same grounded evidence.` : "No primary atom selected.",
    `Detected concepts: ${conceptSummary}.`,
  ];

  return Object.freeze({
    summary: article
      ? `Grounded evidence supports ${article.titleAr}${atom ? ` / ${atom.atomTitleAr}` : ""}.`
      : "Grounded evidence did not resolve to a dominant GCAM article.",
    groundedEvidence,
    primaryArticleId: article?.articleId ?? null,
    primaryArticleTitleAr: article?.titleAr ?? null,
    primaryAtomId: atom?.atomId ?? null,
    primaryAtomTitleAr: atom?.atomTitleAr ?? null,
    rationale: Object.freeze(rationale),
  });
}

export function createNormalizeSceneStateNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => freezeSceneAnalysisState({
    ...state,
    status: state.status === "pending" ? "running" : state.status,
    normalizedSceneText: normalizeText(state.sceneText),
    sentences: splitSentences(state.sceneText),
  });
}

export function createExtractEvidenceSpansNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const sentences = state.sentences.length > 0 ? state.sentences : splitSentences(state.sceneText);
    const spans = collectEvidenceSpans(sentences);
    const primary = selectPrimaryEvidenceSpan(spans);
    return freezeSceneAnalysisState({
      ...state,
      sentences,
      evidenceSpans: spans,
      primaryEvidenceSpanId: primary?.spanId ?? null,
      primaryEvidenceText: primary?.text ?? null,
      primaryEvidenceReason: primary ? "Highest-signal grounded sentence span selected as the primary evidence." : null,
    });
  };
}

export function createDetectConceptsNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const concepts = CONCEPT_DEFINITIONS
      .map((definition) => scoreConcept(definition, state.evidenceSpans))
      .filter((value): value is SceneAnalysisConcept => value !== null);

    const spanConceptIds = new Map<string, Set<string>>();
    for (const concept of concepts) {
      for (const spanId of concept.evidenceSpanIds) {
        const bucket = spanConceptIds.get(spanId) ?? new Set<string>();
        bucket.add(concept.conceptId);
        spanConceptIds.set(spanId, bucket);
      }
    }

    const evidenceSpans = state.evidenceSpans.map((span) => Object.freeze({
      ...span,
      conceptIds: Object.freeze([...(spanConceptIds.get(span.spanId) ?? new Set<string>())].sort((left, right) => left.localeCompare(right))),
      rationale: span.rationale.length > 0 ? span.rationale : Object.freeze([`No concept attached to ${span.spanId}.`]),
    }));

    return freezeSceneAnalysisState({
      ...state,
      evidenceSpans,
      detectedConcepts: Object.freeze(concepts.sort((left, right) => right.confidence - left.confidence || left.conceptId.localeCompare(right.conceptId))),
    });
  };
}

export function createResolveKnowledgeDomainsNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const domains = conceptDomains(state.detectedConcepts);
    return freezeSceneAnalysisState({
      ...state,
      knowledgeDomains: domains,
    });
  };
}

export function createResolveCandidateArticlesNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const candidates = resolveArticlesFromDomains(state.knowledgeDomains, state.detectedConcepts, state.evidenceSpans);
    return freezeSceneAnalysisState({
      ...state,
      candidateArticles: candidates,
    });
  };
}

export function createRankCandidateArticlesNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const ranked = rankCandidateArticles(state.candidateArticles);
    return freezeSceneAnalysisState({
      ...state,
      rankedCandidateArticles: ranked,
      primaryArticle: ranked[0] ?? null,
      secondaryArticles: Object.freeze(ranked.slice(1, 3)),
    });
  };
}

export function createResolveCandidateAtomsNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const rankedArticles = state.rankedCandidateArticles.length > 0 ? state.rankedCandidateArticles : state.candidateArticles;
    const atoms = resolveAtomsFromArticles(rankedArticles.slice(0, 3), state.detectedConcepts, state.evidenceSpans);
    return freezeSceneAnalysisState({
      ...state,
      candidateAtoms: atoms,
      rankedCandidateAtoms: atoms,
    });
  };
}

export function createComposeExplanationNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const primaryEvidence = state.evidenceSpans.find((span) => span.spanId === state.primaryEvidenceSpanId) ?? state.evidenceSpans[0] ?? null;
    const primaryAtom = state.rankedCandidateAtoms[0] ?? null;
    return freezeSceneAnalysisState({
      ...state,
      explanation: composeExplanation(primaryEvidence, state.primaryArticle, primaryAtom, state.detectedConcepts),
    });
  };
}

export function createFinalizeSceneAnalysisNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => freezeSceneAnalysisState({
    ...state,
    status: "complete",
  });
}

export function createDefaultSceneAnalysisNodeSequence(): readonly {
  name: string;
  node: (state: SceneAnalysisState) => SceneAnalysisState;
}[] {
  return Object.freeze([
    { name: "normalize_scene", node: createNormalizeSceneStateNode() },
    { name: "extract_evidence", node: createExtractEvidenceSpansNode() },
    { name: "detect_concepts", node: createDetectConceptsNode() },
    { name: "resolve_domains", node: createResolveKnowledgeDomainsNode() },
    { name: "resolve_articles", node: createResolveCandidateArticlesNode() },
    { name: "rank_articles", node: createRankCandidateArticlesNode() },
    { name: "resolve_atoms", node: createResolveCandidateAtomsNode() },
    { name: "compose_explanation", node: createComposeExplanationNode() },
    { name: "finalize", node: createFinalizeSceneAnalysisNode() },
  ]);
}
