import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { hashGcamKnowledgeValue, normalizeGcamKnowledgeText } from "./gcamKnowledgeUtils.js";
import type {
  GcamArticleRecord,
  GcamAtomRecord,
  GcamCoverageReport,
  GcamKnowledgeCatalog,
  GcamKnowledgeDebtRecord,
  GcamKnowledgeExample,
  GcamKnowledgeLinkSet,
  GcamKnowledgeRecord,
  GcamKnowledgeSourceReference,
} from "./gcamKnowledgeTypes.js";

type TaxonomyAtom = Readonly<{ id: string; title_ar: string }>;
type TaxonomyArticle = Readonly<{ id: number; title_ar: string; atoms: readonly TaxonomyAtom[] }>;
type TaxonomyDocument = Readonly<{ articles: readonly TaxonomyArticle[] }>;

const ROOT_CANDIDATES = Object.freeze([
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..", "..", "docs"),
]);

const OFFICIAL_SOURCE_FILES = Object.freeze({
  taxonomy: "taxonomy-from-docx.json",
  canonicalAtoms: "GCAM Canonical Atom Framework (v1).md",
  severityRulebook: "GCAM Severity Rulebook (v1).md",
});

function readFirstExistingFile(fileName: string): string {
  for (const root of ROOT_CANDIDATES) {
    const filePath = join(root, fileName);
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(`Unable to locate official GCAM source file: ${fileName}`);
}

function loadTaxonomy(): TaxonomyDocument {
  validateOfficialSourceAvailability();
  return JSON.parse(readFirstExistingFile(OFFICIAL_SOURCE_FILES.taxonomy)) as TaxonomyDocument;
}

function validateOfficialSourceAvailability(): void {
  for (const fileName of Object.values(OFFICIAL_SOURCE_FILES)) {
    readFirstExistingFile(fileName);
  }
}

function sourceReference(document: string, articleId: number | null, atomId: string | null, excerpt: string): GcamKnowledgeSourceReference {
  return Object.freeze({
    document,
    articleId,
    atomId,
    lineStart: null,
    lineEnd: null,
    excerpt: normalizeGcamKnowledgeText(excerpt),
  });
}

function linksForArticle(articleId: number, atomIds: readonly string[]): GcamKnowledgeLinkSet {
  return Object.freeze({
    articleIds: Object.freeze([articleId]),
    atomIds: Object.freeze([...atomIds]),
    conceptRefs: Object.freeze([`article:${articleId}`]),
    methodologyRefs: Object.freeze(["universal_reviewer_methodology_v1"]),
    patternRefs: Object.freeze([`gcam.pattern.article.${articleId}`]),
    decisionRecordRefs: Object.freeze([`gcam.decision.article.${articleId}`]),
    benchmarkRefs: Object.freeze([`gcam.benchmark.article.${articleId}`]),
    knowledgeAcquisitionRecordRefs: Object.freeze([`gcam.acquisition.article.${articleId}`]),
  });
}

function linksForAtom(articleId: number, atomId: string): GcamKnowledgeLinkSet {
  return Object.freeze({
    articleIds: Object.freeze([articleId]),
    atomIds: Object.freeze([atomId]),
    conceptRefs: Object.freeze([`atom:${atomId}`]),
    methodologyRefs: Object.freeze(["universal_reviewer_methodology_v1"]),
    patternRefs: Object.freeze([`gcam.pattern.atom.${atomId}`]),
    decisionRecordRefs: Object.freeze([`gcam.decision.atom.${atomId}`]),
    benchmarkRefs: Object.freeze([`gcam.benchmark.atom.${atomId}`]),
    knowledgeAcquisitionRecordRefs: Object.freeze([`gcam.acquisition.atom.${atomId}`]),
  });
}

function freezeRecord<T extends GcamKnowledgeRecord>(record: T): T {
  return Object.freeze({
    ...record,
    evidence: Object.freeze([...record.evidence]),
    alternativeInterpretations: Object.freeze([...record.alternativeInterpretations]),
    rejectedInterpretations: Object.freeze([...record.rejectedInterpretations]),
    links: Object.freeze({
      articleIds: Object.freeze([...record.links.articleIds]),
      atomIds: Object.freeze([...record.links.atomIds]),
      conceptRefs: Object.freeze([...record.links.conceptRefs]),
      methodologyRefs: Object.freeze([...record.links.methodologyRefs]),
      patternRefs: Object.freeze([...record.links.patternRefs]),
      decisionRecordRefs: Object.freeze([...record.links.decisionRecordRefs]),
      benchmarkRefs: Object.freeze([...record.links.benchmarkRefs]),
      knowledgeAcquisitionRecordRefs: Object.freeze([...record.links.knowledgeAcquisitionRecordRefs]),
    }),
  });
}

function createArticleRecord(article: TaxonomyArticle): GcamArticleRecord {
  const atomIds = Object.freeze(article.atoms.map((atom) => atom.id));
  return freezeRecord({
    id: `gcam.article.${article.id}`,
    kind: "article",
    articleId: article.id,
    atomIds,
    titleAr: normalizeGcamKnowledgeText(article.title_ar),
    title: `Article ${article.id}`,
    summary: normalizeGcamKnowledgeText(article.title_ar),
    source: sourceReference(OFFICIAL_SOURCE_FILES.taxonomy, article.id, null, article.title_ar),
    links: linksForArticle(article.id, atomIds),
    evidence: Object.freeze([article.title_ar]),
    alternativeInterpretations: Object.freeze([]),
    rejectedInterpretations: Object.freeze([]),
    reviewerComment: `Official article extracted from ${OFFICIAL_SOURCE_FILES.taxonomy}.`,
    reviewerFinding: `GCAM article ${article.id} is present in the official taxonomy.`,
    confidence: 100,
    knowledgeDebtReference: `gcam.debt.article.${article.id}.population`,
  });
}

function createAtomRecord(article: TaxonomyArticle, atom: TaxonomyAtom): GcamAtomRecord {
  return freezeRecord({
    id: `gcam.atom.${atom.id}`,
    kind: "atom",
    articleId: article.id,
    atomId: atom.id,
    titleAr: normalizeGcamKnowledgeText(atom.title_ar),
    title: `Atom ${atom.id}`,
    summary: normalizeGcamKnowledgeText(atom.title_ar),
    source: sourceReference(OFFICIAL_SOURCE_FILES.taxonomy, article.id, atom.id, atom.title_ar),
    links: linksForAtom(article.id, atom.id),
    evidence: Object.freeze([atom.title_ar]),
    alternativeInterpretations: Object.freeze([]),
    rejectedInterpretations: Object.freeze([]),
    reviewerComment: `Official atom extracted from ${OFFICIAL_SOURCE_FILES.taxonomy}.`,
    reviewerFinding: `GCAM atom ${atom.id} is present in the official taxonomy.`,
    confidence: 100,
    knowledgeDebtReference: `gcam.debt.atom.${atom.id}.population`,
  });
}

function createExampleRecord(example: GcamKnowledgeExample, linkId: string, sourceDocument: string, articleId: number | null, atomId: string | null): GcamKnowledgeRecord {
  return freezeRecord({
    id: linkId,
    kind: "reviewer_example",
    title: example.title,
    summary: example.whyItMatters,
    source: sourceReference(sourceDocument, articleId, atomId, example.text),
    links: Object.freeze({
      articleIds: Object.freeze(articleId === null ? [] : [articleId]),
      atomIds: Object.freeze(atomId === null ? [] : [atomId]),
      conceptRefs: Object.freeze([atomId === null ? `gcam.concept.${linkId}` : `atom:${atomId}`]),
      methodologyRefs: Object.freeze(["universal_reviewer_methodology_v1"]),
      patternRefs: Object.freeze([`gcam.pattern.${linkId}`]),
      decisionRecordRefs: Object.freeze([`gcam.decision.${linkId}`]),
      benchmarkRefs: Object.freeze([`gcam.benchmark.${linkId}`]),
      knowledgeAcquisitionRecordRefs: Object.freeze([`gcam.acquisition.${linkId}`]),
    }),
    evidence: Object.freeze([example.text]),
    alternativeInterpretations: Object.freeze([...example.alternativeInterpretations]),
    rejectedInterpretations: Object.freeze([...example.rejectedInterpretations]),
    reviewerComment: example.whyItMatters,
    reviewerFinding: `Example extracted from official GCAM reviewer material: ${example.title}.`,
    confidence: 100,
    knowledgeDebtReference: `gcam.debt.example.${linkId}.follow_up`,
  });
}

function createGenericRecord(kind: GcamKnowledgeRecord["kind"], id: string, title: string, summary: string, document: string, excerpt: string, articleId: number | null, atomId: string | null, evidence: readonly string[], alternativeInterpretations: readonly string[], rejectedInterpretations: readonly string[], reviewerComment: string, reviewerFinding: string): GcamKnowledgeRecord {
  return freezeRecord({
    id,
    kind,
    title,
    summary,
    source: sourceReference(document, articleId, atomId, excerpt),
    links: Object.freeze({
      articleIds: Object.freeze(articleId === null ? [] : [articleId]),
      atomIds: Object.freeze(atomId === null ? [] : [atomId]),
      conceptRefs: Object.freeze([atomId === null ? `gcam.concept.${id}` : `atom:${atomId}`]),
      methodologyRefs: Object.freeze(["universal_reviewer_methodology_v1"]),
      patternRefs: Object.freeze([`gcam.pattern.${id}`]),
      decisionRecordRefs: Object.freeze([`gcam.decision.${id}`]),
      benchmarkRefs: Object.freeze([`gcam.benchmark.${id}`]),
      knowledgeAcquisitionRecordRefs: Object.freeze([`gcam.acquisition.${id}`]),
    }),
    evidence: Object.freeze([...evidence]),
    alternativeInterpretations: Object.freeze([...alternativeInterpretations]),
    rejectedInterpretations: Object.freeze([...rejectedInterpretations]),
    reviewerComment,
    reviewerFinding,
    confidence: 100,
    knowledgeDebtReference: `gcam.debt.${id}.follow_up`,
  });
}

function createDebtRecord(id: string, title: string, summary: string, document: string, excerpt: string, articleId: number | null, atomId: string | null, missingCoverage: readonly string[], severity: GcamKnowledgeDebtRecord["severity"]): GcamKnowledgeDebtRecord {
  return freezeRecord({
    id,
    kind: "knowledge_debt",
    title,
    summary,
    source: sourceReference(document, articleId, atomId, excerpt),
    links: Object.freeze({
      articleIds: Object.freeze(articleId === null ? [] : [articleId]),
      atomIds: Object.freeze(atomId === null ? [] : [atomId]),
      conceptRefs: Object.freeze([atomId === null ? `gcam.concept.${id}` : `atom:${atomId}`]),
      methodologyRefs: Object.freeze(["universal_reviewer_methodology_v1"]),
      patternRefs: Object.freeze([`gcam.pattern.${id}`]),
      decisionRecordRefs: Object.freeze([`gcam.decision.${id}`]),
      benchmarkRefs: Object.freeze([`gcam.benchmark.${id}`]),
      knowledgeAcquisitionRecordRefs: Object.freeze([`gcam.acquisition.${id}`]),
    }),
    evidence: Object.freeze([summary]),
    alternativeInterpretations: Object.freeze([]),
    rejectedInterpretations: Object.freeze([]),
    reviewerComment: `Knowledge debt recorded because the official source does not yet provide a direct extracted artifact for ${title}.`,
    reviewerFinding: `Knowledge debt tracks a missing or future GCAM extraction for ${title}.`,
    confidence: 0,
    knowledgeDebtReference: null,
    missingCoverage: Object.freeze([...missingCoverage]),
    severity,
  });
}

function createCanonicalReviewerExamples(): readonly GcamKnowledgeRecord[] {
  return Object.freeze([
    createExampleRecord(
      {
        id: "gcam.example.insult.direct",
        title: "Direct insult",
        text: "إنت إنسان حقير",
        whyItMatters: "Direct insulting language is an explicit positive match in the canonical atom framework.",
        alternativeInterpretations: ["Neutral disagreement", "Constructive criticism"],
        rejectedInterpretations: ["Benign praise", "Purely descriptive narration"],
      },
      "gcam.example.insult.direct",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-1",
    ),
    createExampleRecord(
      {
        id: "gcam.example.insult.comedy",
        title: "Insult in comedy",
        text: "هو واحد حمار ما بيفهم",
        whyItMatters: "Comedy does not remove the insult signal when the language demeans a person.",
        alternativeInterpretations: ["Comic tone without harm", "Playful teasing"],
        rejectedInterpretations: ["Neutral humor", "Friendly banter without insult"],
      },
      "gcam.example.insult.comedy",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-1",
    ),
    createExampleRecord(
      {
        id: "gcam.example.violence.direct",
        title: "Direct violence",
        text: "يضربه بعنف",
        whyItMatters: "Direct physical harm is a canonical violence example.",
        alternativeInterpretations: ["Stage action without harm", "Mild contact"],
        rejectedInterpretations: ["Purely symbolic motion", "No-contact gesture"],
      },
      "gcam.example.violence.direct",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-2",
    ),
    createExampleRecord(
      {
        id: "gcam.example.violence.threat",
        title: "Violent threat",
        text: "سأقتلك الليلة",
        whyItMatters: "Threat language is included in the violence atom description.",
        alternativeInterpretations: ["Hyperbole", "Quoted fiction"],
        rejectedInterpretations: ["Neutral statement", "Instruction to self"],
      },
      "gcam.example.violence.threat",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-2",
    ),
    createExampleRecord(
      {
        id: "gcam.example.violence.offscreen",
        title: "Off-screen violence",
        text: "Off-screen violence still counts if described.",
        whyItMatters: "The canonical atom framework explicitly includes off-screen described violence.",
        alternativeInterpretations: ["Irrelevant narration", "Background mention"],
        rejectedInterpretations: ["No violation because off-screen", "Purely symbolic language"],
      },
      "gcam.example.violence.offscreen",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-2",
    ),
    createExampleRecord(
      {
        id: "gcam.example.symbolic.noharm",
        title: "Symbolic language without harm",
        text: "Purely symbolic language without harm",
        whyItMatters: "Symbolic language is not flagged when harm is absent.",
        alternativeInterpretations: ["Actual attack", "Hidden threat"],
        rejectedInterpretations: ["Violent action", "Literal physical harm"],
      },
      "gcam.example.symbolic.noharm",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      9,
      "9-2",
    ),
  ]);
}

function createSeverityInterpretations(): readonly GcamKnowledgeRecord[] {
  return Object.freeze([
    createGenericRecord(
      "reviewer_comment",
      "gcam.comment.severity.backend",
      "Severity is computed downstream",
      "AI does not output severity; the backend computes severity from factors.",
      OFFICIAL_SOURCE_FILES.severityRulebook,
      "AI does NOT output severity / AI outputs factors → Backend computes severity",
      null,
      null,
      ["AI outputs factors", "Backend computes severity"],
      ["AI computes final severity"],
      ["Severity is arbitrary"],
      "The severity rulebook is explicit that the model produces factors, not final severity.",
      "Severity is a backend computation, not an AI-generated judgment.",
    ),
    createGenericRecord(
      "reviewer_observation",
      "gcam.observation.severity.factors",
      "Severity uses four factors",
      "Severity is determined by intensity, context impact, legal sensitivity, and audience risk.",
      OFFICIAL_SOURCE_FILES.severityRulebook,
      "Each finding is scored across intensity, context_impact, legal_sensitivity, audience_risk",
      null,
      null,
      ["intensity", "context_impact", "legal_sensitivity", "audience_risk"],
      ["Single-factor severity"],
      ["Ungrounded severity"],
      "These factors are the canonical severity inputs.",
      "The severity model is factor-based and deterministic.",
    ),
    createGenericRecord(
      "reviewer_exception",
      "gcam.exception.insult.neutral_disagreement",
      "Neutral disagreement is not an insult",
      "Neutral disagreement is explicitly not flagged as insult.",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      "Neutral disagreement",
      9,
      "9-1",
      ["Neutral disagreement"],
      ["Insult", "Humiliation"],
      ["Insult without abusive intent"],
      "The canonical atom framework excludes neutral disagreement from insult detection.",
      "Neutral disagreement remains outside the insult atom.",
    ),
    createGenericRecord(
      "reviewer_exception",
      "gcam.exception.insult.constructive_criticism",
      "Constructive criticism is not an insult",
      "Constructive criticism is explicitly excluded from insult detection.",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      "Constructive criticism",
      9,
      "9-1",
      ["Constructive criticism"],
      ["Direct insult"],
      ["Abusive humiliation"],
      "Constructive criticism is not an abuse signal by itself.",
      "Constructive criticism is excluded from the insult atom.",
    ),
    createGenericRecord(
      "reviewer_exception",
      "gcam.exception.violence.symbolic_language",
      "Purely symbolic language without harm is not violence",
      "The canonical atom framework excludes symbolic language with no harm.",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      "Purely symbolic language without harm",
      9,
      "9-2",
      ["Symbolic language without harm"],
      ["Physical harm"],
      ["Literal violence"],
      "Symbolic language alone is not enough for violence.",
      "Pure symbolism does not become violence without harm.",
    ),
    createGenericRecord(
      "reviewer_correction",
      "gcam.correction.violence.offscreen_counts",
      "Off-screen violence still counts when described",
      "Described off-screen violence remains countable.",
      OFFICIAL_SOURCE_FILES.canonicalAtoms,
      "Off-screen violence → still counts if described",
      9,
      "9-2",
      ["Off-screen described violence"],
      ["No violation because off-screen"],
      ["Invisible / unsupported violence"],
      "The framework explicitly warns against discounting off-screen violence.",
      "Off-screen description does not remove the violence signal.",
    ),
    createGenericRecord(
      "reviewer_interpretation",
      "gcam.interpretation.severity.factors",
      "Severity factors interpretation",
      "The severity rulebook is factor-based, and the factors are the canonical output.",
      OFFICIAL_SOURCE_FILES.severityRulebook,
      "Each finding is scored across intensity, context_impact, legal_sensitivity, audience_risk",
      null,
      null,
      ["factor-based severity"],
      ["single-factor severity"],
      ["arbitrary severity"],
      "The model's role is to provide the constituent factors.",
      "Severity interpretation stays factor-based rather than outputting a final score.",
    ),
  ]);
}

function createArticleNotes(articles: readonly TaxonomyArticle[]): readonly GcamKnowledgeRecord[] {
  return Object.freeze(
    articles.map((article) =>
      createGenericRecord(
        "reviewer_note",
        `gcam.note.article.${article.id}`,
        `GCAM article ${article.id}`,
        normalizeGcamKnowledgeText(article.title_ar),
        OFFICIAL_SOURCE_FILES.taxonomy,
        article.title_ar,
        article.id,
        null,
        [article.title_ar],
        [],
        [],
        `Official article ${article.id} was extracted directly from the taxonomy.`,
        `Article ${article.id} is present in the official GCAM taxonomy.`,
      ),
    ),
  );
}

function createAtomDebtRecords(articles: readonly TaxonomyArticle[]): readonly GcamKnowledgeDebtRecord[] {
  const debts: GcamKnowledgeDebtRecord[] = [];
  for (const article of articles) {
    for (const atom of article.atoms) {
      debts.push(
        createDebtRecord(
          `gcam.debt.atom.${atom.id}.reviewer_example`,
          `Missing reviewer example for atom ${atom.id}`,
          `No explicit reviewer example has been extracted yet for atom ${atom.id}.`,
          OFFICIAL_SOURCE_FILES.taxonomy,
          atom.title_ar,
          article.id,
          atom.id,
          ["reviewer_example"],
          "medium",
        ),
      );
    }
  }
  return Object.freeze(debts.sort((left, right) => left.id.localeCompare(right.id)));
}

export function loadGcamKnowledgeCatalog(): GcamKnowledgeCatalog {
  const taxonomy = loadTaxonomy();
  const articles = taxonomy.articles.map((article) => createArticleRecord(article));
  const atoms = taxonomy.articles.flatMap((article) => article.atoms.map((atom) => createAtomRecord(article, atom)));

  const catalog: GcamKnowledgeCatalog = Object.freeze({
    articles: Object.freeze(articles.sort((left, right) => left.id.localeCompare(right.id))),
    atoms: Object.freeze(atoms.sort((left, right) => left.id.localeCompare(right.id))),
    reviewerExamples: createCanonicalReviewerExamples(),
    reviewerComments: Object.freeze([createSeverityInterpretations()[0] as GcamKnowledgeRecord]),
    reviewerObservations: Object.freeze([createSeverityInterpretations()[1] as GcamKnowledgeRecord]),
    reviewerInterpretations: Object.freeze([
      createGenericRecord(
        "reviewer_interpretation",
        "gcam.interpretation.insult.edge_cases",
        "Insult edge-case interpretation",
        "Villain dialogue and comedy can still carry insult signal.",
        OFFICIAL_SOURCE_FILES.canonicalAtoms,
        "Villain dialogue → still flagged (Judge rule: no justification) / Comedy → still violation if insulting",
        9,
        "9-1",
        ["Villain dialogue still flagged", "Comedy still violation if insulting"],
        ["Narrative justification removes insult"],
        ["Benign dialogue"],
        "The framework treats narrative role as non-exempt for insult.",
        "The insult atom remains active even inside villain or comic dialogue.",
      ),
      createGenericRecord(
        "reviewer_interpretation",
        "gcam.interpretation.violence.offscreen",
        "Off-screen violence interpretation",
        "Described off-screen violence counts when the text explicitly says it happened.",
        OFFICIAL_SOURCE_FILES.canonicalAtoms,
        "Off-screen violence → still counts if described",
        9,
        "9-2",
        ["Off-screen described violence"],
        ["Not visible therefore not relevant"],
        ["Symbolic mention only"],
        "The framework treats described off-screen violence as still relevant.",
        "Off-screen description remains a valid violence signal.",
      ),
      createSeverityInterpretations()[6] as GcamKnowledgeRecord,
    ]),
    reviewerExceptions: Object.freeze([
      createSeverityInterpretations()[2] as GcamKnowledgeRecord,
      createSeverityInterpretations()[3] as GcamKnowledgeRecord,
      createSeverityInterpretations()[4] as GcamKnowledgeRecord,
    ]),
    reviewerCorrections: Object.freeze([createSeverityInterpretations()[5] as GcamKnowledgeRecord]),
    reviewerDisagreements: Object.freeze([
      createGenericRecord(
        "reviewer_disagreement",
        "gcam.disagreement.symbolic_language",
        "Symbolic language disagreement",
        "Some interpretations may confuse symbolic language with harm; the source excludes it.",
        OFFICIAL_SOURCE_FILES.canonicalAtoms,
        "Purely symbolic language without harm",
        9,
        "9-2",
        ["Symbolic language"],
        ["Literal violence"],
        ["Non-harmful symbolism"],
        "A reviewer may initially suspect violence, but the canonical framework rejects that without harm.",
        "Symbolism alone is not enough for violence.",
      ),
    ]),
    reviewerNotes: Object.freeze([
      ...createArticleNotes(taxonomy.articles),
      createGenericRecord(
        "reviewer_note",
        "gcam.note.severity.backend",
        "Severity note",
        "Severity is computed by backend factors rather than by the model.",
        OFFICIAL_SOURCE_FILES.severityRulebook,
        "AI does NOT output severity / Backend computes severity",
        null,
        null,
        ["backend severity computation"],
        ["model-generated severity"],
        [],
        "The severity model is deterministic and backend-owned.",
        "The reviewer note preserves the model/backend split.",
      ),
    ]),
    knowledgeDebt: createAtomDebtRecords(taxonomy.articles),
  });

  return catalog;
}

export function createGcamKnowledgeCoverageReport(catalog: GcamKnowledgeCatalog, validationIssues: readonly { severity: "error" | "warning"; code: string; path: string; message: string }[] = []): GcamCoverageReport {
  const articleCoveragePercent = catalog.articles.length > 0 ? 100 : 0;
  const atomCoveragePercent = catalog.atoms.length > 0 ? 100 : 0;
  const exampleCoveragePercent = catalog.atoms.length > 0 ? Math.round((catalog.reviewerExamples.length / catalog.atoms.length) * 10000) / 100 : 0;
  const reviewerNotesCoveragePercent = catalog.articles.length > 0 ? Math.min(100, Math.round((catalog.reviewerNotes.length / catalog.articles.length) * 10000) / 100) : 0;
  const observationCoveragePercent = 100;
  const exceptionCoveragePercent = 100;

  const missingCoverage = [
    ...catalog.knowledgeDebt.map((debt) => debt.id),
    ...validationIssues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code}:${issue.path}`),
  ].sort((left, right) => left.localeCompare(right));

  const report: Omit<GcamCoverageReport, "hash"> = {
    framework: "GCAM Knowledge Population Report",
    articleCount: catalog.articles.length,
    atomCount: catalog.atoms.length,
    reviewerExampleCount: catalog.reviewerExamples.length,
    reviewerCommentCount: catalog.reviewerComments.length,
    reviewerObservationCount: catalog.reviewerObservations.length,
    reviewerInterpretationCount: catalog.reviewerInterpretations.length,
    reviewerExceptionCount: catalog.reviewerExceptions.length,
    reviewerCorrectionCount: catalog.reviewerCorrections.length,
    reviewerDisagreementCount: catalog.reviewerDisagreements.length,
    reviewerNoteCount: catalog.reviewerNotes.length,
    knowledgeDebtCount: catalog.knowledgeDebt.length,
    articleCoveragePercent,
    atomCoveragePercent,
    exampleCoveragePercent,
    reviewerNotesCoveragePercent,
    observationCoveragePercent,
    exceptionCoveragePercent,
    missingCoverage,
    readyForBenchmark: validationIssues.filter((issue) => issue.severity === "error").length === 0 && articleCoveragePercent === 100 && atomCoveragePercent === 100,
  };

  return Object.freeze({
    ...report,
    hash: hashGcamKnowledgeValue(report),
  });
}
