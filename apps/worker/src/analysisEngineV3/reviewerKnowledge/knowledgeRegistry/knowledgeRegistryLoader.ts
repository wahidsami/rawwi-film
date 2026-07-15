import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseReviewerAcademyPackDocumentText } from "../academy/reviewerAcademyIndex.js";
import type { ReviewerAcademyPackDocument } from "../academy/reviewerAcademyTypes.js";
import { loadDecisionRecordsFromExamples } from "../decisionRecords/decisionRecordLoader.js";
import { loadPatternLibraryDocuments } from "../patternLibraries/patternLibraryLoader.js";
import type { PatternLibraryEntry } from "../patternLibraries/patternLibraryTypes.js";
import { loadReviewerKnowledgeLessonsFromDirectory } from "../lessons/lessonLoader.js";
import { loadKnowledgeAcquisitionRecordsFromDirectory } from "../knowledgeAcquisition/extractors/knowledgeAcquisitionExtractor.js";
import { loadGcamKnowledgeRegistryFromDirectory } from "../gcamKnowledge/registries/gcamKnowledgeRegistry.js";
import { hashKnowledgeRegistryValue, normalizeKnowledgeRegistryId, normalizeKnowledgeRegistryText, uniqueSortedKnowledgeRegistryStrings } from "./knowledgeRegistryUtils.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryKind } from "./knowledgeRegistryTypes.js";

import type { BlueprintDocument, BlueprintEntry, BlueprintRelationship } from "../blueprints/blueprintTypes.js";

const BLUEPRINT_FILE_NAMES = Object.freeze(["domain.json", "concepts.json", "actions.json", "targets.json", "contexts.json", "intents.json", "evidence.json", "relationships.json", "reviewQuestions.json"]);
const ACADEMY_PACK_FILE_NAMES = Object.freeze(["pack.v1.json", "pack.v1.yaml", "pack.v1.yml"]);

function isDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function loadAcademyDocuments(rootDir: string): readonly ReviewerAcademyPackDocument[] {
  if (!isDirectory(rootDir)) return Object.freeze([]);

  const folders = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const documents: ReviewerAcademyPackDocument[] = [];
  for (const folder of folders) {
    const folderPath = join(rootDir, folder);
    const fileCandidates = ACADEMY_PACK_FILE_NAMES.map((fileName) => join(folderPath, fileName)).filter((filePath) => existsSync(filePath));
    if (fileCandidates.length === 0) continue;
    const filePath = fileCandidates.sort((left, right) => left.localeCompare(right))[0];
    if (!filePath) continue;
    documents.push(parseReviewerAcademyPackDocumentText(readFileSync(filePath, "utf8")));
  }

  return Object.freeze(documents);
}

function normalizeVersion(version: { major: number; minor: number; patch: number } | null | undefined): string | null {
  if (!version) return null;
  return `${version.major}.${version.minor}.${version.patch}`;
}

function registryKey(kind: KnowledgeRegistryKind, id: string): string {
  return `${kind}:${normalizeKnowledgeRegistryId(id)}`;
}

function makeEntry(input: Readonly<{
  kind: KnowledgeRegistryKind;
  id: string;
  title: string;
  description: string;
  version?: string | null;
  domain?: string | null;
  category?: string | null;
  tags?: readonly string[];
  aliases?: readonly string[];
  relatedIds?: readonly string[];
  createdAt?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  sourceKind?: string | null;
  sourcePath?: string | null;
  sourceDocumentId?: string | null;
  sourcePage?: number | null;
  reviewer?: string | null;
  meeting?: string | null;
  date?: string | null;
  summary?: string | null;
  evidence?: readonly string[];
  reasoning?: readonly string[];
  decision?: string | null;
  confidence?: number | null;
  alternativeInterpretations?: readonly string[];
  rejectedInterpretations?: readonly string[];
  payload: Record<string, unknown>;
}>): KnowledgeRegistryEntry {
  const metadata = Object.freeze({
    id: normalizeKnowledgeRegistryText(input.id),
    title: normalizeKnowledgeRegistryText(input.title),
    description: normalizeKnowledgeRegistryText(input.description),
    version: input.version ?? null,
    kind: input.kind,
    domain: input.domain ? normalizeKnowledgeRegistryText(input.domain) : null,
    category: input.category ? normalizeKnowledgeRegistryText(input.category) : null,
    tags: uniqueSortedKnowledgeRegistryStrings(input.tags ?? []),
    aliases: uniqueSortedKnowledgeRegistryStrings(input.aliases ?? []),
    relatedIds: uniqueSortedKnowledgeRegistryStrings(input.relatedIds ?? []),
    createdAt: input.createdAt ?? null,
    updatedAt: input.updatedAt ?? null,
    hash: "",
  });
  const traceability = Object.freeze({
    source: input.source ? normalizeKnowledgeRegistryText(input.source) : null,
    sourceKind: normalizeKnowledgeRegistryText(input.sourceKind ?? input.kind),
    sourcePath: input.sourcePath ? normalizeKnowledgeRegistryText(input.sourcePath) : null,
    sourceDocumentId: input.sourceDocumentId ? normalizeKnowledgeRegistryText(input.sourceDocumentId) : null,
    sourcePage: input.sourcePage ?? null,
    reviewer: input.reviewer ? normalizeKnowledgeRegistryText(input.reviewer) : null,
    meeting: input.meeting ? normalizeKnowledgeRegistryText(input.meeting) : null,
    date: input.date ? normalizeKnowledgeRegistryText(input.date) : null,
  });
  const explainability = Object.freeze({
    summary: normalizeKnowledgeRegistryText(input.summary ?? input.description),
    evidence: Object.freeze([...new Set((input.evidence ?? []).map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))]),
    reasoning: Object.freeze([...new Set((input.reasoning ?? []).map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))]),
    decision: input.decision ? normalizeKnowledgeRegistryText(input.decision) : null,
    confidence: input.confidence ?? null,
    alternativeInterpretations: Object.freeze([...new Set((input.alternativeInterpretations ?? []).map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))]),
    rejectedInterpretations: Object.freeze([...new Set((input.rejectedInterpretations ?? []).map((value) => normalizeKnowledgeRegistryText(value)).filter(Boolean))]),
  });
  const hash = hashKnowledgeRegistryValue({
    registryKey: registryKey(input.kind, input.id),
    metadata,
    traceability,
    explainability,
    payload: input.payload,
  });

  return Object.freeze({
    registryKey: registryKey(input.kind, input.id),
    metadata: Object.freeze({ ...metadata, hash }),
    traceability,
    explainability,
    payload: Object.freeze({ ...input.payload }),
  });
}

function loadBlueprintDocuments(rootDir: string): readonly BlueprintDocument[] {
  if (!isDirectory(rootDir)) {
    return Object.freeze([]);
  }

  const docs: BlueprintDocument[] = [];
  const folders = readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const folder of folders) {
    const folderPath = join(rootDir, folder);
    const fileCandidates = BLUEPRINT_FILE_NAMES.map((fileName) => join(folderPath, fileName)).filter((filePath) => existsSync(filePath));
    if (fileCandidates.length === 0) continue;

    const filePath = fileCandidates.sort((left, right) => left.localeCompare(right))[0];
    if (!filePath) continue;

    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    docs.push(Object.freeze({
      version: typeof parsed.version === "string" ? normalizeKnowledgeRegistryText(parsed.version) : "",
      id: typeof parsed.id === "string" ? normalizeKnowledgeRegistryText(parsed.id) : folder,
      title: typeof parsed.title === "string" ? normalizeKnowledgeRegistryText(parsed.title) : folder,
      description: typeof parsed.description === "string" ? normalizeKnowledgeRegistryText(parsed.description) : "",
      entries: Object.freeze(entries.map((entry) => {
        if (entry && typeof entry === "object" && "from" in entry && "to" in entry && "type" in entry) {
          const relationship = entry as BlueprintRelationship;
          return Object.freeze({
            from: normalizeKnowledgeRegistryText(relationship.from),
            to: normalizeKnowledgeRegistryText(relationship.to),
            type: normalizeKnowledgeRegistryText(relationship.type) as BlueprintRelationship["type"],
          });
        }
        const blueprintEntry = entry as BlueprintEntry;
        return Object.freeze({
          id: normalizeKnowledgeRegistryText(blueprintEntry.id),
          title: normalizeKnowledgeRegistryText(blueprintEntry.title),
          description: normalizeKnowledgeRegistryText(blueprintEntry.description),
        });
      })),
    }));
  }

  return Object.freeze(docs);
}

function createBlueprintRegistryEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const documents = loadBlueprintDocuments(rootDir);
  const entries: KnowledgeRegistryEntry[] = [];

  for (const document of documents) {
    const entryIds = document.entries
      .filter((entry): entry is BlueprintEntry => "id" in entry)
      .map((entry) => registryKey("blueprint_entry", entry.id));
    const documentKey = `${document.id}:${document.version}`;
    const relationshipTargets = document.entries
      .filter((entry): entry is BlueprintRelationship => "from" in entry)
      .flatMap((entry) => [registryKey("blueprint_entry", entry.from), registryKey("blueprint_entry", entry.to)]);

    entries.push(makeEntry({
      kind: "blueprint_document",
      id: documentKey,
      title: document.title,
      description: document.description,
      version: document.version,
      category: "blueprint",
      tags: entryIds,
      relatedIds: uniqueSortedKnowledgeRegistryStrings(relationshipTargets),
      source: "blueprint_documents",
      sourceKind: "blueprint_document",
      sourcePath: document.id,
      summary: document.description,
      payload: {
        schema_version: document.version,
        document: document.id,
        entry_count: document.entries.length,
        entries: document.entries,
      },
    }));

    for (const entry of document.entries) {
      if ("id" in entry) {
        entries.push(makeEntry({
          kind: "blueprint_entry",
          id: entry.id,
          title: entry.title,
          description: entry.description,
          version: document.version,
          category: document.id,
          relatedIds: uniqueSortedKnowledgeRegistryStrings(
            document.entries
              .filter((candidate): candidate is BlueprintRelationship => "from" in candidate)
              .flatMap((relationship) => [registryKey("blueprint_entry", relationship.from), registryKey("blueprint_entry", relationship.to)])
              .filter((candidate) => candidate !== registryKey("blueprint_entry", entry.id)),
          ),
          source: "blueprint_documents",
          sourceKind: "blueprint_entry",
          sourcePath: document.id,
          summary: entry.description,
          payload: {
            document_id: document.id,
            document_version: document.version,
            entry,
          },
        }));
      }
    }
  }

  return Object.freeze(entries);
}

function createAcademyEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const academyRoot = join(rootDir, "academy");
  if (!isDirectory(academyRoot)) return Object.freeze([]);
  const documents = loadAcademyDocuments(academyRoot);
  const entries: KnowledgeRegistryEntry[] = [];

  for (const document of documents) {
    entries.push(makeEntry({
      kind: "academy_pack_document",
      id: document.metadata.id,
      title: document.metadata.title,
      description: document.metadata.description,
      version: normalizeVersion(document.metadata.version),
      domain: document.metadata.id,
      category: "academy_pack",
      tags: document.metadata.supported_concepts,
      aliases: [document.metadata.id.replace(/^v\d+_\d+_/, "")],
      relatedIds: document.pack ? [registryKey("academy_pack", document.pack.id)] : [],
      source: "academy",
      sourceKind: "academy_pack_document",
      sourcePath: join("academy", document.metadata.id),
      summary: document.metadata.description,
      payload: {
        schema_version: document.schema_version,
        pack_version: normalizeVersion(document.pack_version),
        metadata: document.metadata,
        has_pack: document.pack !== null,
      },
    }));

    if (!document.pack) continue;

    entries.push(makeEntry({
      kind: "academy_pack",
      id: document.pack.id,
      title: document.pack.title,
      description: document.pack.purpose,
      version: normalizeVersion(document.metadata.version),
      domain: document.metadata.id,
      category: "reviewer_knowledge_pack",
      tags: [...document.pack.protected_interests, ...document.pack.protected_concepts, ...document.pack.trigger_concept_ids],
      aliases: [document.pack.module_id],
      relatedIds: [registryKey("academy_pack_document", document.metadata.id)],
      source: "academy",
      sourceKind: "academy_pack",
      sourcePath: join("academy", document.metadata.id, "pack.v1.json"),
      summary: document.pack.purpose,
      evidence: document.pack.required_evidence,
      reasoning: document.pack.reviewer_heuristics,
      decision: document.pack.reporting_guidance[0] ?? null,
      payload: {
        document_metadata: document.metadata,
        pack: document.pack,
      },
    }));
  }

  return Object.freeze(entries);
}

function createLessonEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const lessonsRoot = join(rootDir, "lessons");
  if (!isDirectory(lessonsRoot)) return Object.freeze([]);
  const lessons = loadReviewerKnowledgeLessonsFromDirectory(lessonsRoot);
  return Object.freeze(lessons.map((lesson) => makeEntry({
    kind: "lesson",
    id: lesson.id,
    title: lesson.title,
    description: lesson.summary,
    version: `${lesson.version.major}.${lesson.version.minor}.${lesson.version.patch}`,
    domain: lesson.metadata.subject ?? null,
    category: lesson.metadata.category ?? null,
    tags: lesson.metadata.tags ?? [],
    aliases: [],
    relatedIds: [...lesson.prerequisites.map((id) => registryKey("lesson", id)), ...lesson.relatedLessons.map((id) => registryKey("lesson", id))],
    createdAt: lesson.metadata.createdAt ? String(lesson.metadata.createdAt) : null,
    updatedAt: lesson.metadata.updatedAt ? String(lesson.metadata.updatedAt) : null,
    source: lesson.metadata.source ?? null,
    sourceKind: "lesson",
    sourcePath: lesson.metadata.source ?? null,
    summary: lesson.summary,
    evidence: lesson.examples,
    reasoning: lesson.reviewerQuestions.map((question) => question.reasoningGuidance),
    decision: lesson.reportTemplates[0]?.reasonTemplate ?? null,
    confidence: lesson.evidenceRules.confidenceGuidance.length > 0 ? 1 : null,
    payload: {
      lesson,
    },
  })));
}

function createPatternEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const patternRoot = join(rootDir, "patternLibraries");
  if (!isDirectory(patternRoot)) return Object.freeze([]);
  const documents = loadPatternLibraryDocuments(patternRoot);
  const entries: KnowledgeRegistryEntry[] = [];

  for (const document of documents) {
    const entryIds = document.entries.filter((entry): entry is PatternLibraryEntry => "id" in entry).map((entry) => entry.id);
    entries.push(makeEntry({
      kind: "pattern_document",
      id: document.metadata.id,
      title: document.metadata.title,
      description: document.metadata.description,
      version: `${document.version.major}.${document.version.minor}.${document.version.patch}`,
      category: "pattern_library",
      tags: document.metadata.concepts.map((concept) => concept.id),
      relatedIds: entryIds,
      source: "patternLibraries",
      sourceKind: "pattern_document",
      sourcePath: document.metadata.id,
      summary: document.metadata.description,
      payload: { document },
    }));

    for (const entry of document.entries) {
      entries.push(makeEntry({
        kind: "pattern_entry",
        id: entry.id,
        title: entry.title,
        description: entry.description,
        version: `${document.version.major}.${document.version.minor}.${document.version.patch}`,
        domain: document.metadata.id,
        category: "pattern_entry",
        tags: [...entry.related_concept_ids, ...entry.semantic_intent],
        aliases: [],
        relatedIds: [],
        source: "patternLibraries",
        sourceKind: "pattern_entry",
        sourcePath: document.metadata.id,
        summary: entry.description,
        evidence: [...entry.direct_expressions, ...entry.indirect_expressions, ...entry.supporting_evidence],
        reasoning: [...entry.reviewer_guidance],
        decision: entry.examples[0]?.expected_outcome ?? null,
        confidence: entry.confidence_modifiers[0]?.confidence ?? null,
        payload: {
          document_id: document.metadata.id,
          document_version: `${document.version.major}.${document.version.minor}.${document.version.patch}`,
          entry,
        },
      }));
    }
  }

  return Object.freeze(entries);
}

function createDecisionEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const decisionRoot = join(rootDir, "decisionRecords", "examples");
  if (!isDirectory(decisionRoot)) return Object.freeze([]);
  const records = loadDecisionRecordsFromExamples(decisionRoot);
  return Object.freeze(records.map((record) => makeEntry({
    kind: "decision_record",
    id: record.id,
    title: record.title,
    description: record.summary,
    version: record.version,
    domain: record.relatedBlueprintConcepts[0] ?? null,
    category: record.findingType,
    tags: record.benchmarkTags,
    aliases: [],
    relatedIds: [
      ...record.relatedLessons.map((id) => registryKey("lesson", id)),
      ...record.relatedPatterns.map((id) => registryKey("pattern_entry", id)),
      ...record.relatedBlueprintConcepts.map((id) => registryKey("blueprint_entry", id)),
    ],
    source: "decisionRecords",
    sourceKind: "decision_record",
    sourcePath: join("decisionRecords", "examples", `${record.id}.json`),
    summary: record.summary,
    evidence: [...record.supportingEvidence, ...record.contradictingEvidence, ...record.requiredMissingEvidence],
    reasoning: record.reasoningSteps,
    decision: record.reviewerDecision,
    confidence: null,
    alternativeInterpretations: [],
    rejectedInterpretations: [],
    payload: { record },
  })));
}

function createKnowledgeAcquisitionEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const acquisitionRoot = join(rootDir, "knowledgeAcquisition");
  if (!isDirectory(acquisitionRoot)) return Object.freeze([]);
  const categoryFolders = [
    "reviewerNotes",
    "reviewerObservations",
    "reviewerCorrections",
    "reviewerDisagreements",
    "reviewerExamples",
    "knowledgeEvolution",
  ].map((folder) => join(acquisitionRoot, folder));
  const records = categoryFolders.flatMap((folder) => loadKnowledgeAcquisitionRecordsFromDirectory(folder));
  const uniqueRecords = [...new Map(records.map((record) => [record.id, record] as const)).values()].sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(uniqueRecords.map((record) => {
    const relatedIds = uniqueSortedKnowledgeRegistryStrings([
      ...record.relatedLessons.map((id) => registryKey("lesson", id)),
      ...record.relatedPatterns.map((id) => registryKey("pattern_entry", id)),
      ...record.relatedDecisionRecords.map((id) => registryKey("decision_record", id)),
      ...record.relatedRecordIds.map((id) => registryKey("knowledge_acquisition_record", id)),
      ...(record.supersedesId ? [registryKey("knowledge_acquisition_record", record.supersedesId)] : []),
      ...(record.supersededById ? [registryKey("knowledge_acquisition_record", record.supersededById)] : []),
    ]);

    return makeEntry({
      kind: "knowledge_acquisition_record",
      id: record.id,
      title: `${record.knowledgeType}: ${record.domain}`,
      description: record.storyContext,
      version: record.version,
      domain: record.domain,
      category: record.knowledgeType,
      tags: [...record.concepts, record.agreementState, record.source],
      aliases: record.reviewerName ? [record.reviewerName] : [],
      relatedIds,
      source: record.source,
      sourceKind: record.source,
      sourcePath: join("knowledgeAcquisition", `${record.id}.json`),
      reviewer: record.reviewerName,
      date: record.date,
      summary: record.storyContext,
      evidence: record.evidence,
      reasoning: record.reasoning,
      decision: record.decision,
      confidence: record.reviewerConfidence,
      alternativeInterpretations: record.alternativeDecisions,
      rejectedInterpretations: record.rejectedInterpretations,
      payload: { record },
    });
  }));
}

function createGcamKnowledgeEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const gcamRoot = join(rootDir, "gcamKnowledge");
  if (!isDirectory(gcamRoot)) return Object.freeze([]);
  const registry = loadGcamKnowledgeRegistryFromDirectory(gcamRoot);
  return Object.freeze(registry.listAll().map((record) => makeEntry({
    kind: "gcam_knowledge_record",
    id: record.id,
    title: record.title,
    description: record.description,
    version: record.version,
    domain: record.domains[0] ?? null,
    category: record.kind,
    tags: [...record.concepts, ...record.domains],
    aliases: [],
    relatedIds: [
      ...record.relatedLessons.map((id) => registryKey("lesson", id)),
      ...record.relatedPatternLibraries.map((id) => registryKey("pattern_document", id)),
      ...record.relatedDecisionRecords.map((id) => registryKey("decision_record", id)),
      ...record.relatedKnowledgeAcquisitionRecords.map((id) => registryKey("knowledge_acquisition_record", id)),
    ],
    source: record.source.documentId,
    sourceKind: record.kind,
    sourcePath: null,
    sourceDocumentId: record.source.documentId,
    sourcePage: record.source.sourcePage,
    reviewer: record.source.reviewer,
    meeting: record.source.meeting,
    date: record.source.date,
    summary: record.description,
    evidence: record.evidence,
    reasoning: record.reasoning,
    decision: record.decision,
    confidence: record.confidence,
    alternativeInterpretations: record.alternativeInterpretations,
    rejectedInterpretations: record.rejectedInterpretations,
    payload: { record },
  })));
}

export function loadKnowledgeRegistryEntries(rootDir: string): readonly KnowledgeRegistryEntry[] {
  const entries = [
    ...createBlueprintRegistryEntries(rootDir),
    ...createAcademyEntries(rootDir),
    ...createLessonEntries(rootDir),
    ...createPatternEntries(rootDir),
    ...createDecisionEntries(rootDir),
    ...createKnowledgeAcquisitionEntries(rootDir),
    ...createGcamKnowledgeEntries(rootDir),
  ];

  return Object.freeze(entries.sort((left, right) => left.registryKey.localeCompare(right.registryKey)));
}

export function defaultKnowledgeRegistryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}
