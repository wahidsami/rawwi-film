import { canonicalStringify } from "../../canonicalJson.js";
import { sha256 } from "../../hash.js";
import { buildFindingTruthFromEvidence, type FindingTruth } from "../truthVerification.js";
import type { Evidence } from "../evidence/evidenceTypes.js";

type RecordLike = Readonly<Record<string, unknown>>;

export type ProvenanceSourceRef = Readonly<{
  sourceFile: string;
  lineNumber: number;
}>;

export type ProvenanceStageReport = Readonly<{
  stage: "Evidence" | "Concept" | "Article" | "Explanation" | "Judge" | "DB row" | "UI";
  objectIdentity: string;
  truthId: string | null;
  evidenceId: string | null;
  hash: string;
  timestamp: string | null;
  sourceFile: string;
  lineNumber: number;
  summary: string;
}>;

export type ProvenanceFindingReport = Readonly<{
  findingId: string;
  canonicalFindingId: string | null;
  evidenceId: string | null;
  truthId: string | null;
  sourceRunKey: string | null;
  stages: readonly ProvenanceStageReport[];
}>;

export type ProvenanceReport = Readonly<{
  jobId: string;
  reportId: string | null;
  generatedAt: string;
  findings: readonly ProvenanceFindingReport[];
  markdown: string;
}>;

export type ProvenanceChunkRun = Readonly<{
  jobId: string;
  runKey: string;
  truthLayerMeta: RecordLike | null;
}>;

export type ProvenanceReportInput = Readonly<{
  jobId: string;
  analysisReport: RecordLike | null;
  analysisFindings: readonly RecordLike[];
  chunkRuns: readonly ProvenanceChunkRun[];
}>;

type RuntimeOrchestratorLike = Readonly<{
  report?: RecordLike | null;
  provenance?: RecordLike | null;
  trace?: RecordLike | null;
  runtime?: RecordLike | null;
}>;

type TraceDocumentLike = Readonly<{
  sceneId?: string | null;
  evidenceCollection?: RecordLike | null;
  conceptCollection?: RecordLike | null;
  legalDecisionCollection?: RecordLike | null;
  explanationCollection?: RecordLike | null;
  verifiedFindingCollection?: RecordLike | null;
  decisionProvenanceCollection?: RecordLike | null;
  findingTruth?: RecordLike | null;
  sceneSummary?: string | null;
}>;

type RuntimeProvenanceLike = Readonly<{
  findingId?: string | null;
  sceneId?: string | null;
  evidenceIds?: readonly string[] | null;
  conceptIds?: readonly string[] | null;
  legalDecisionIds?: readonly string[] | null;
  explanationIds?: readonly string[] | null;
  executionOrder?: readonly string[] | null;
  timestamps?: readonly string[] | null;
}>;

const SOURCE_REFS = Object.freeze({
  evidence: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/analysisEngineV4/evidence/evidenceExtractionNode.ts",
    lineNumber: 8,
  }),
  concept: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/analysisEngineV4/concepts/conceptClassificationNode.ts",
    lineNumber: 12,
  }),
  article: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/analysisEngineV4/legal/legalMappingNode.ts",
    lineNumber: 19,
  }),
  explanation: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/analysisEngineV4/explanations/explanationNode.ts",
    lineNumber: 147,
  }),
  judge: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/analysisEngineV4/judge/qualityJudgeNode.ts",
    lineNumber: 5,
  }),
  dbRow: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/worker/src/pipeline.ts",
    lineNumber: 3442,
  }),
  ui: Object.freeze<ProvenanceSourceRef>({
    sourceFile: "apps/web/src/pages/Results.tsx",
    lineNumber: 1958,
  }),
});

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): RecordLike | null {
  return isRecord(value) ? value : null;
}

function stringify(value: unknown): string {
  return canonicalStringify(value);
}

function hashObject(value: unknown): string {
  return sha256(stringify(value));
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function pickNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getFindingIdentity(finding: RecordLike): string {
  return pickString(finding.canonical_finding_id)
    ?? pickString(finding.lineage_id)
    ?? pickString(finding.id)
    ?? `finding-${hashObject(finding).slice(0, 12)}`;
}

function getCanonicalFindingId(finding: RecordLike): string | null {
  return pickString(finding.canonical_finding_id)
    ?? pickString(finding.lineage_id)
    ?? pickString((asRecord(finding.location)?.v3 as RecordLike | undefined)?.canonical_finding_id);
}

function findRecordByIdentity<T extends RecordLike>(records: readonly T[] | null | undefined, predicate: (entry: T) => boolean): T | null {
  return records?.find(predicate) ?? null;
}

function extractRuntimeOrchestrator(chunkRun: ProvenanceChunkRun): RuntimeOrchestratorLike | null {
  const truthLayerMeta = asRecord(chunkRun.truthLayerMeta);
  if (!truthLayerMeta) {
    return null;
  }

  const runtimeOrchestrator = asRecord(truthLayerMeta.runtime_orchestrator);
  if (runtimeOrchestrator) {
    return runtimeOrchestrator as RuntimeOrchestratorLike;
  }

  const fallbackReport = asRecord(truthLayerMeta.report);
  const fallbackProvenance = asRecord(truthLayerMeta.provenance);
  const fallbackTrace = asRecord(truthLayerMeta.trace_document);
  if (!fallbackReport && !fallbackProvenance && !fallbackTrace) {
    return null;
  }

  return freeze({
    report: fallbackReport,
    provenance: fallbackProvenance,
    trace: fallbackTrace,
    runtime: asRecord(truthLayerMeta.runtime),
  });
}

function extractTraceDocument(runtimeOrchestrator: RuntimeOrchestratorLike | null, chunkRun: ProvenanceChunkRun): TraceDocumentLike | null {
  const trace = asRecord(runtimeOrchestrator?.trace);
  if (trace) {
    return trace as TraceDocumentLike;
  }

  const truthLayerMeta = asRecord(chunkRun.truthLayerMeta);
  const fallbackTrace = asRecord(truthLayerMeta?.trace_document);
  return fallbackTrace ? (fallbackTrace as TraceDocumentLike) : null;
}

function extractProvenance(runtimeOrchestrator: RuntimeOrchestratorLike | null, traceDocument: TraceDocumentLike | null): readonly RuntimeProvenanceLike[] {
  const runtimeProvenance = asRecord(runtimeOrchestrator?.provenance);
  if (runtimeProvenance) {
    const provenance = runtimeProvenance.provenance;
    if (Array.isArray(provenance)) {
      return provenance.filter(isRecord) as readonly RuntimeProvenanceLike[];
    }
  }

  const traceProvenance = asRecord(traceDocument?.decisionProvenanceCollection);
  if (traceProvenance) {
    const provenance = traceProvenance.provenance;
    if (Array.isArray(provenance)) {
      return provenance.filter(isRecord) as readonly RuntimeProvenanceLike[];
    }
  }

  return freeze([]);
}

function extractRuntimeFindings(runtimeOrchestrator: RuntimeOrchestratorLike | null): readonly RecordLike[] {
  const report = asRecord(runtimeOrchestrator?.report);
  const findings = report?.analysisFindings;
  if (Array.isArray(findings)) {
    return findings.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractTraceEvidenceCollection(traceDocument: TraceDocumentLike | null): readonly RecordLike[] {
  const evidenceCollection = asRecord(traceDocument?.evidenceCollection);
  const evidence = evidenceCollection?.evidence;
  if (Array.isArray(evidence)) {
    return evidence.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractTraceConceptCollection(traceDocument: TraceDocumentLike | null): readonly RecordLike[] {
  const conceptCollection = asRecord(traceDocument?.conceptCollection);
  const concepts = conceptCollection?.concepts;
  if (Array.isArray(concepts)) {
    return concepts.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractTraceLegalCollection(traceDocument: TraceDocumentLike | null): readonly RecordLike[] {
  const legalCollection = asRecord(traceDocument?.legalDecisionCollection);
  const decisions = legalCollection?.decisions;
  if (Array.isArray(decisions)) {
    return decisions.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractTraceExplanationCollection(traceDocument: TraceDocumentLike | null): readonly RecordLike[] {
  const explanationCollection = asRecord(traceDocument?.explanationCollection);
  const explanations = explanationCollection?.explanations;
  if (Array.isArray(explanations)) {
    return explanations.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractTraceVerifiedFindings(traceDocument: TraceDocumentLike | null): readonly RecordLike[] {
  const verifiedFindingCollection = asRecord(traceDocument?.verifiedFindingCollection);
  const verifiedFindings = verifiedFindingCollection?.verifiedFindings;
  if (Array.isArray(verifiedFindings)) {
    return verifiedFindings.filter(isRecord) as readonly RecordLike[];
  }
  return freeze([]);
}

function extractAnalysisReportGeneratedAt(analysisReport: RecordLike | null, fallback: string): string {
  const summaryJson = asRecord(analysisReport?.summaryJson);
  return pickString(summaryJson?.generated_at) ?? pickString(analysisReport?.created_at) ?? fallback;
}

function findAnalysisFindingRow(analysisFindings: readonly RecordLike[], findingId: string, evidenceId: string | null): RecordLike | null {
  const canonicalFinding = analysisFindings.find((row) => {
    const canonicalId = pickString((asRecord(row.location)?.v3 as RecordLike | undefined)?.canonical_finding_id);
    const lineageId = pickString(row.lineage_id);
    const rowId = pickString(row.id);
    return canonicalId === findingId || lineageId === findingId || rowId === findingId;
  });
  if (canonicalFinding) return canonicalFinding;

  if (evidenceId) {
    return analysisFindings.find((row) => {
      const snippet = normalizeText(pickString(row.evidence_snippet));
      const locationV3 = asRecord(row.location)?.v3 as RecordLike | undefined;
      const rowEvidenceId = pickString(locationV3?.evidence_id);
      return rowEvidenceId === evidenceId || snippet === normalizeText(evidenceId);
    }) ?? null;
  }

  return null;
}

function getFindingTruth(sceneId: string, evidence: RecordLike | null): FindingTruth | null {
  if (!evidence) {
    return null;
  }

  const id = pickString(evidence.id) ?? pickString(evidence.spanId) ?? "";
  const text = pickString(evidence.text) ?? pickString(evidence.rawText) ?? "";
  const page = pickNumber(evidence.page) ?? pickNumber(evidence.page_number) ?? 1;
  const scene = pickString(evidence.scene) ?? text;
  const startOffset = pickNumber(evidence.startOffset) ?? pickNumber(evidence.start_offset_global) ?? 0;
  const endOffset = pickNumber(evidence.endOffset) ?? pickNumber(evidence.end_offset_global) ?? startOffset;
  const evidenceShape = {
    id,
    spanId: pickString(evidence.spanId) ?? id,
    page,
    scene,
    startOffset,
    endOffset,
    rawText: text,
  };
  return buildFindingTruthFromEvidence(sceneId, freeze({
    id: evidenceShape.id,
    spanId: evidenceShape.spanId,
    page: evidenceShape.page,
    scene: evidenceShape.scene,
    startOffset: evidenceShape.startOffset,
    endOffset: evidenceShape.endOffset,
    text,
    rawText: text,
  } as unknown as Evidence));
}

function buildStageReport(input: Readonly<{
  stage: ProvenanceStageReport["stage"];
  objectIdentity: string;
  truthId: string | null;
  evidenceId: string | null;
  timestamp: string | null;
  source: ProvenanceSourceRef;
  summary: string;
  payload: unknown;
}>): ProvenanceStageReport {
  return freeze({
    stage: input.stage,
    objectIdentity: input.objectIdentity,
    truthId: input.truthId,
    evidenceId: input.evidenceId,
    hash: hashObject(input.payload),
    timestamp: input.timestamp,
    sourceFile: input.source.sourceFile,
    lineNumber: input.source.lineNumber,
    summary: input.summary,
  });
}

function buildUiSummary(input: Readonly<{
  jobId: string;
  reportId: string | null;
  findingId: string;
  analysisFindingRow: RecordLike | null;
  analysisReport: RecordLike | null;
}>): string {
  const findingRowId = pickString(input.analysisFindingRow?.id) ?? "missing";
  const reportSummary = asRecord(input.analysisReport?.summaryJson);
  const generatedAt = pickString(reportSummary?.generated_at) ?? extractAnalysisReportGeneratedAt(input.analysisReport, "unknown");
  return [
    `Results.tsx renders current-analysis findings for job ${input.jobId}`,
    `reportService.getReport({ jobId }) -> reportsApi.getByJob(jobId)`,
    `findingId=${input.findingId}`,
    `analysis_reports.id=${input.reportId ?? "missing"}`,
    `analysis_findings.id=${findingRowId}`,
    `generated_at=${generatedAt}`,
  ].join("; ");
}

function buildFindingStages(input: Readonly<{
  jobId: string;
  reportId: string | null;
  analysisReport: RecordLike | null;
  analysisFindingRow: RecordLike | null;
  traceDocument: TraceDocumentLike | null;
  provenance: RuntimeProvenanceLike | null;
}>): readonly ProvenanceStageReport[] {
  const evidenceCollection = extractTraceEvidenceCollection(input.traceDocument);
  const conceptCollection = extractTraceConceptCollection(input.traceDocument);
  const legalCollection = extractTraceLegalCollection(input.traceDocument);
  const explanationCollection = extractTraceExplanationCollection(input.traceDocument);
  const verifiedFindings = extractTraceVerifiedFindings(input.traceDocument);
  const evidenceId = pickString(input.provenance?.evidenceIds?.[0])
    ?? pickString((asRecord(input.analysisFindingRow?.location)?.v3 as RecordLike | undefined)?.evidence_id)
    ?? pickString(input.analysisFindingRow?.evidence_id)
    ?? null;

  const evidence = evidenceId
    ? findRecordByIdentity(evidenceCollection, (entry) => pickString(entry.id) === evidenceId || pickString(entry.spanId) === evidenceId)
    : evidenceCollection[0] ?? null;
  const truth = getFindingTruth(input.jobId, evidence);
  const truthId = truth?.truthId ?? null;

  const conceptId = pickString(input.provenance?.conceptIds?.[0])
    ?? pickString((asRecord(input.analysisFindingRow?.location)?.v3 as RecordLike | undefined)?.concept_id)
    ?? null;
  const concept = conceptId
    ? findRecordByIdentity(conceptCollection, (entry) => pickString(entry.conceptId) === conceptId || pickString(entry.id) === conceptId)
    : conceptCollection[0] ?? null;

  const legalDecisionId = pickString(input.provenance?.legalDecisionIds?.[0])
    ?? pickString((asRecord(input.analysisFindingRow?.location)?.v3 as RecordLike | undefined)?.legal_decision_id)
    ?? null;
  const legalDecision = legalDecisionId
    ? findRecordByIdentity(legalCollection, (entry) => pickString(entry.id) === legalDecisionId)
    : legalCollection[0] ?? null;

  const explanationId = pickString(input.provenance?.explanationIds?.[0])
    ?? pickString((asRecord(input.analysisFindingRow?.location)?.v3 as RecordLike | undefined)?.explanation_id)
    ?? null;
  const explanation = explanationId
    ? findRecordByIdentity(explanationCollection, (entry) => pickString(entry.id) === explanationId)
    : explanationCollection[0] ?? null;

  const findingId = pickString(input.provenance?.findingId)
    ?? pickString(input.analysisFindingRow?.canonical_finding_id)
    ?? pickString(input.analysisFindingRow?.lineage_id)
    ?? pickString(input.analysisFindingRow?.id)
    ?? "finding-unknown";
  const verifiedFinding = findRecordByIdentity(verifiedFindings, (entry) => pickString(entry.findingId) === findingId)
    ?? verifiedFindings[0] ?? null;

  const evidenceTimestamp = pickString(input.provenance?.timestamps?.[1]) ?? null;
  const conceptTimestamp = pickString(input.provenance?.timestamps?.[2]) ?? null;
  const legalTimestamp = pickString(input.provenance?.timestamps?.[3]) ?? null;
  const explanationTimestamp = pickString(input.provenance?.timestamps?.[4]) ?? null;
  const judgeTimestamp = pickString(input.provenance?.timestamps?.[5]) ?? null;
  const dbRowTimestamp = pickString(input.analysisFindingRow?.created_at) ?? null;
  const uiTimestamp = extractAnalysisReportGeneratedAt(input.analysisReport, dbRowTimestamp ?? "unknown");

  const articleId = pickNumber((legalDecision?.primaryArticle as RecordLike | undefined)?.articleId)
    ?? pickNumber((legalDecision?.primaryArticle as RecordLike | undefined)?.article_id)
    ?? pickNumber(input.analysisFindingRow?.article_id)
    ?? null;

  const primaryArticleTitle = pickString((legalDecision?.primaryArticle as RecordLike | undefined)?.titleAr)
    ?? pickString((legalDecision?.primaryArticle as RecordLike | undefined)?.title_ar)
    ?? null;

  const explanationSummary = pickString(explanation?.summary)
    ?? pickString(explanation?.title)
    ?? pickString(input.analysisFindingRow?.description_ar)
    ?? "";

  const judgeResult = pickString(verifiedFinding?.verificationResult)
    ?? pickString(input.analysisFindingRow?.review_status)
    ?? "unknown";

  const evidenceSummary = [
    `evidenceText=${normalizeText(pickString(evidence?.text) ?? pickString(evidence?.rawText) ?? "")}`,
    `line=${pickString(evidence?.lineId) ?? "n/a"}`,
  ].join("; ");
  const conceptSummary = [
    `conceptId=${pickString(concept?.conceptId) ?? "n/a"}`,
    `label=${pickString(concept?.label) ?? "n/a"}`,
    `domains=${Array.isArray(concept?.knowledgeDomains) ? concept.knowledgeDomains.join(",") : "n/a"}`,
  ].join("; ");
  const articleSummary = [
    `decisionId=${pickString(legalDecision?.id) ?? "n/a"}`,
    `articleId=${articleId ?? "n/a"}`,
    `title=${primaryArticleTitle ?? "n/a"}`,
    `secondaryArticles=${Array.isArray(legalDecision?.secondaryArticles) ? legalDecision.secondaryArticles.length : 0}`,
  ].join("; ");
  const explanationStageSummary = [
    `explanationId=${pickString(explanation?.id) ?? "n/a"}`,
    `summary=${normalizeText(explanationSummary)}`,
    `recommendedAction=${pickString(explanation?.recommendedAction) ?? "n/a"}`,
  ].join("; ");
  const judgeSummary = [
    `findingId=${pickString(verifiedFinding?.findingId) ?? findingId}`,
    `verificationResult=${judgeResult}`,
    `overallConfidence=${String(pickNumber(verifiedFinding?.overallConfidence) ?? pickNumber(input.analysisFindingRow?.confidence) ?? 0)}`,
  ].join("; ");
  const dbRowSummary = [
    `analysis_findings.id=${pickString(input.analysisFindingRow?.id) ?? "missing"}`,
    `canonical_finding_id=${pickString(input.analysisFindingRow?.canonical_finding_id) ?? pickString(input.analysisFindingRow?.lineage_id) ?? "missing"}`,
    `evidence_snippet=${normalizeText(pickString(input.analysisFindingRow?.evidence_snippet) ?? "")}`,
  ].join("; ");
  const uiSummary = buildUiSummary({
    jobId: input.jobId,
    reportId: input.reportId,
    findingId,
    analysisFindingRow: input.analysisFindingRow,
    analysisReport: input.analysisReport,
  });

  return freeze([
    buildStageReport({
      stage: "Evidence",
      objectIdentity: pickString(evidence?.id) ?? evidenceId ?? "missing",
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: evidenceTimestamp,
      source: SOURCE_REFS.evidence,
      summary: evidenceSummary,
      payload: evidence ?? { findingId, evidenceId },
    }),
    buildStageReport({
      stage: "Concept",
      objectIdentity: pickString(concept?.id) ?? conceptId ?? "missing",
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: conceptTimestamp,
      source: SOURCE_REFS.concept,
      summary: conceptSummary,
      payload: concept ?? { findingId, conceptId, evidenceId },
    }),
    buildStageReport({
      stage: "Article",
      objectIdentity: pickString(legalDecision?.id) ?? `article-${articleId ?? "missing"}`,
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: legalTimestamp,
      source: SOURCE_REFS.article,
      summary: articleSummary,
      payload: legalDecision ?? { findingId, legalDecisionId, articleId },
    }),
    buildStageReport({
      stage: "Explanation",
      objectIdentity: pickString(explanation?.id) ?? explanationId ?? "missing",
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: explanationTimestamp,
      source: SOURCE_REFS.explanation,
      summary: explanationStageSummary,
      payload: explanation ?? { findingId, explanationId, evidenceId },
    }),
    buildStageReport({
      stage: "Judge",
      objectIdentity: pickString(verifiedFinding?.findingId) ?? findingId,
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: judgeTimestamp,
      source: SOURCE_REFS.judge,
      summary: judgeSummary,
      payload: verifiedFinding ?? { findingId, evidenceId },
    }),
    buildStageReport({
      stage: "DB row",
      objectIdentity: pickString(input.analysisFindingRow?.id) ?? findingId,
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: dbRowTimestamp,
      source: SOURCE_REFS.dbRow,
      summary: dbRowSummary,
      payload: input.analysisFindingRow ?? { findingId, evidenceId, articleId },
    }),
    buildStageReport({
      stage: "UI",
      objectIdentity: `Results.tsx#renderFindingCard(${pickString(input.analysisFindingRow?.id) ?? findingId})`,
      truthId,
      evidenceId: pickString(evidence?.id) ?? evidenceId,
      timestamp: uiTimestamp,
      source: SOURCE_REFS.ui,
      summary: uiSummary,
      payload: {
        jobId: input.jobId,
        reportId: input.reportId,
        findingId,
        analysisFindingRowId: pickString(input.analysisFindingRow?.id) ?? null,
        renderPath: "Results.tsx -> reportService.getReport -> reportsApi.getByJob -> renderFindingCard",
      },
    }),
  ]);
}

function renderStageTable(stages: readonly ProvenanceStageReport[]): string {
  const lines: string[] = [];
  lines.push("| Stage | Object identity | Truth ID | Evidence ID | Hash | Timestamp | Source file | Line number | Summary |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const stage of stages) {
    lines.push(
      `| ${stage.stage.replace(/\|/g, "\\|")} | ${stage.objectIdentity.replace(/\|/g, "\\|")} | ${String(stage.truthId ?? "n/a").replace(/\|/g, "\\|")} | ${String(stage.evidenceId ?? "n/a").replace(/\|/g, "\\|")} | ${stage.hash} | ${String(stage.timestamp ?? "n/a").replace(/\|/g, "\\|")} | ${stage.sourceFile} | ${stage.lineNumber} | ${stage.summary.replace(/\|/g, "\\|")} |`,
    );
  }
  return lines.join("\n");
}

function renderFindingMarkdown(finding: ProvenanceFindingReport): string {
  const lines: string[] = [];
  lines.push(`## Finding ${finding.findingId}`);
  lines.push(`- Canonical finding id: ${finding.canonicalFindingId ?? "n/a"}`);
  lines.push(`- Truth ID: ${finding.truthId ?? "n/a"}`);
  lines.push(`- Evidence ID: ${finding.evidenceId ?? "n/a"}`);
  lines.push(`- Source run key: ${finding.sourceRunKey ?? "n/a"}`);
  lines.push("");
  lines.push(renderStageTable(finding.stages));
  lines.push("");
  return lines.join("\n");
}

export function renderProvenanceReportMarkdown(report: ProvenanceReport): string {
  const lines: string[] = [];
  lines.push("# V4 Provenance Report");
  lines.push("");
  lines.push(`- Job ID: ${report.jobId}`);
  lines.push(`- Report ID: ${report.reportId ?? "n/a"}`);
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Findings traced: ${report.findings.length}`);
  lines.push("");
  if (report.findings.length === 0) {
    lines.push("_No findings were available for provenance tracing._");
    lines.push("");
    return lines.join("\n");
  }

  for (const finding of report.findings) {
    lines.push(renderFindingMarkdown(finding));
  }

  return lines.join("\n");
}

function buildFindingReports(input: ProvenanceReportInput): readonly ProvenanceFindingReport[] {
  const runtimeChunks = input.chunkRuns.map((chunkRun) => {
    const runtimeOrchestrator = extractRuntimeOrchestrator(chunkRun);
    const traceDocument = extractTraceDocument(runtimeOrchestrator, chunkRun);
    const provenanceItems = extractProvenance(runtimeOrchestrator, traceDocument);
    const runtimeFindings = extractRuntimeFindings(runtimeOrchestrator);
    const analysisFindingRows = input.analysisFindings;

    return runtimeFindings.map((finding) => {
      const findingId = getFindingIdentity(finding);
      const canonicalFindingId = getCanonicalFindingId(finding);
      const provenance = provenanceItems.find((item) => pickString(item.findingId) === findingId || pickString(item.findingId) === canonicalFindingId) ?? provenanceItems[0] ?? null;
      const evidenceId = pickString(provenance?.evidenceIds?.[0]) ?? pickString((finding as RecordLike).evidence_id) ?? null;
      const analysisFindingRow = findAnalysisFindingRow(analysisFindingRows, findingId, evidenceId);
      const stages = buildFindingStages({
        jobId: input.jobId,
        reportId: pickString(input.analysisReport?.id) ?? null,
        analysisReport: input.analysisReport,
        analysisFindingRow,
        traceDocument,
        provenance: provenance ?? null,
      });

      const truthId = stages[0]?.truthId ?? null;
      return freeze({
        findingId,
        canonicalFindingId,
        evidenceId: stages[0]?.evidenceId ?? evidenceId,
        truthId,
        sourceRunKey: chunkRun.runKey,
        stages,
      });
    });
  });

  const flattened = runtimeChunks.flat();
  const byFindingId = new Map<string, ProvenanceFindingReport>();
  for (const finding of flattened) {
    if (!byFindingId.has(finding.findingId)) {
      byFindingId.set(finding.findingId, finding);
    }
  }

  return freeze([...byFindingId.values()].sort((left, right) => left.findingId.localeCompare(right.findingId)));
}

export function buildProvenanceReport(input: ProvenanceReportInput): ProvenanceReport {
  const findings = buildFindingReports(input);
  const reportId = pickString(input.analysisReport?.id) ?? null;
  const generatedAt = extractAnalysisReportGeneratedAt(input.analysisReport, "unknown");
  const markdown = renderProvenanceReportMarkdown({
    jobId: input.jobId,
    reportId,
    generatedAt,
    findings,
    markdown: "",
  });

  return freeze({
    jobId: input.jobId,
    reportId,
    generatedAt,
    findings,
    markdown,
  });
}
