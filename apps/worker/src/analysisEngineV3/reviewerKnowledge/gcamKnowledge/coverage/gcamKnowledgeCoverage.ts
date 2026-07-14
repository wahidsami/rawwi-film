import type { GcamKnowledgeCatalog, GcamKnowledgeCoverageReport, GcamKnowledgeRegistry } from "../schemas/gcamKnowledgeTypes.js";
import { createGcamKnowledgeCoverageReport } from "../renderers/gcamKnowledgeRenderer.js";

function isCatalogEmpty(catalog: GcamKnowledgeCatalog): boolean {
  return (
    catalog.articles.length === 0 &&
    catalog.atoms.length === 0 &&
    catalog.reviewerExamples.length === 0 &&
    catalog.reviewerComments.length === 0 &&
    catalog.reviewerObservations.length === 0 &&
    catalog.reviewerInterpretations.length === 0 &&
    catalog.reviewerExceptions.length === 0 &&
    catalog.reviewerCorrections.length === 0 &&
    catalog.reviewerDisagreements.length === 0 &&
    catalog.reviewerNotes.length === 0 &&
    catalog.knowledgeDebt.length === 0
  );
}

export function computeGcamKnowledgeCoverageReport(
  catalog: GcamKnowledgeCatalog,
  validationStatus: GcamKnowledgeCoverageReport["validationStatus"] = isCatalogEmpty(catalog) ? "EMPTY" : "VALID",
  warnings: readonly string[] = [],
): GcamKnowledgeCoverageReport {
  return createGcamKnowledgeCoverageReport(catalog, validationStatus, warnings);
}

export function summarizeGcamKnowledgeRegistry(registry: GcamKnowledgeRegistry): GcamKnowledgeCoverageReport {
  return createGcamKnowledgeCoverageReport(
    registry.catalog,
    registry.validation.valid ? (isCatalogEmpty(registry.catalog) ? "EMPTY" : "VALID") : "INVALID",
    registry.validation.issues.map((issue) => `${issue.code}:${issue.message}`),
  );
}
