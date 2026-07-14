import type {
  KnowledgeLintConcept,
  KnowledgeLintCoverage,
  KnowledgeLintMessage,
  KnowledgeLintPack,
  KnowledgeLintStatistics,
  KnowledgeLintSeverity,
} from "./knowledgeLintTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function normalizeId(value: string): string {
  return normalizeText(value).toLowerCase();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && normalizeText(value).length > 0;
}

function makeMessage(severity: KnowledgeLintSeverity, code: string, path: string, message: string): KnowledgeLintMessage {
  return Object.freeze({ severity, code, path, message });
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => normalizeText(value)).filter(Boolean))].sort((left, right) => left.localeCompare(right)));
}

function sortBy<T>(values: readonly T[], comparator: (left: T, right: T) => number): readonly T[] {
  return Object.freeze([...values].sort(comparator));
}

export function normalizeLintSeverity(value: string): KnowledgeLintSeverity {
  return value === "warning" ? "warning" : "error";
}

export function validateMetadata(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  const { metadata } = pack;
  if (!isNonEmptyString(metadata.id)) issues.push(makeMessage("error", "metadata.id.missing", "metadata.id", "Pack ID exists"));
  if (!isNonEmptyString(metadata.version)) issues.push(makeMessage("error", "metadata.version.missing", "metadata.version", "Version exists"));
  if (!isNonEmptyString(metadata.title)) issues.push(makeMessage("error", "metadata.title.missing", "metadata.title", "Title exists"));
  if (!isNonEmptyString(metadata.category)) issues.push(makeMessage("error", "metadata.category.missing", "metadata.category", "Category exists"));
  if (!isNonEmptyString(metadata.language)) issues.push(makeMessage("error", "metadata.language.missing", "metadata.language", "Language exists"));
  if (!isNonEmptyString(metadata.description)) issues.push(makeMessage("error", "metadata.description.missing", "metadata.description", "Description exists"));
  return issues;
}

export function validateConcepts(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const [index, concept] of pack.concepts.entries()) {
    const path = `concepts[${index}]`;
    const id = normalizeId(concept.id);
    const name = normalizeText(concept.name);

    if (!isNonEmptyString(concept.id)) {
      issues.push(makeMessage("error", "concept.id.empty", `${path}.id`, "No empty concept IDs"));
    } else if (seenIds.has(id)) {
      issues.push(makeMessage("error", "concept.id.duplicate", `${path}.id`, "No duplicated concepts"));
    } else {
      seenIds.add(id);
    }

    if (!isNonEmptyString(concept.name)) {
      issues.push(makeMessage("error", "concept.name.empty", `${path}.name`, "Concept name exists"));
    } else if (seenNames.has(name)) {
      issues.push(makeMessage("error", "concept.name.duplicate", `${path}.name`, "No duplicated names"));
    } else {
      seenNames.add(name);
    }

    if (!isNonEmptyString(concept.definition)) {
      issues.push(makeMessage("error", "concept.definition.missing", `${path}.definition`, "Every concept has definition"));
    }
    if (concept.examples.length === 0) {
      issues.push(makeMessage("error", "concept.examples.missing", `${path}.examples`, "Every concept has examples"));
    }
    if (concept.counterExamples.length === 0) {
      issues.push(makeMessage("error", "concept.counterExamples.missing", `${path}.counterExamples`, "Every concept has counterExamples"));
    }
    if (concept.reviewerQuestions.length === 0) {
      issues.push(makeMessage("error", "concept.reviewerQuestions.missing", `${path}.reviewerQuestions`, "Every concept has review questions"));
    }
    if (!isNonEmptyString(concept.reportTemplate.findingTitle)) {
      issues.push(makeMessage("error", "concept.reportTemplate.findingTitle.missing", `${path}.reportTemplate.findingTitle`, "Every concept has finding title"));
    }
    if (!isNonEmptyString(concept.reportTemplate.reasonTemplate)) {
      issues.push(makeMessage("error", "concept.reportTemplate.reasonTemplate.missing", `${path}.reportTemplate.reasonTemplate`, "Every concept has reason template"));
    }
    if (!isNonEmptyString(concept.reportTemplate.recommendationTemplate)) {
      issues.push(makeMessage("error", "concept.reportTemplate.recommendationTemplate.missing", `${path}.reportTemplate.recommendationTemplate`, "Every concept has recommendation template"));
    }
    if (!isNonEmptyString(concept.reportTemplate.severity)) {
      issues.push(makeMessage("error", "concept.reportTemplate.severity.missing", `${path}.reportTemplate.severity`, "Every concept has severity"));
    }
    if (!Number.isFinite(concept.reportTemplate.priority)) {
      issues.push(makeMessage("error", "concept.reportTemplate.priority.missing", `${path}.reportTemplate.priority`, "Every concept has priority"));
    }
    if (!isNonEmptyString(concept.reportTemplate.reportCategory)) {
      issues.push(makeMessage("error", "concept.reportTemplate.reportCategory.missing", `${path}.reportTemplate.reportCategory`, "Every concept has report category"));
    }

    const thresholdValues = concept.confidenceRules.map((rule) => rule.threshold);
    if (thresholdValues.some((threshold) => !Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
      issues.push(makeMessage("error", "concept.confidence.outOfRange", `${path}.confidenceRules`, "Validate 0–100 range"));
    }
    const sortedThresholds = [...thresholdValues].sort((left, right) => left - right);
    if (sortedThresholds.some((threshold, index) => index > 0 && threshold === sortedThresholds[index - 1])) {
      issues.push(makeMessage("error", "concept.confidence.duplicate", `${path}.confidenceRules`, "Detect duplicate thresholds"));
    }
    if (JSON.stringify(sortedThresholds) !== JSON.stringify(thresholdValues)) {
      issues.push(makeMessage("error", "concept.confidence.order", `${path}.confidenceRules`, "Validate ordered thresholds"));
    }

    if (concept.borderlineExamples.length === 0) {
      issues.push(makeMessage("warning", "concept.examples.borderline.missing", `${path}.borderlineExamples`, "Borderline examples missing"));
    }
    if (concept.educationalExamples.length === 0) {
      issues.push(makeMessage("warning", "concept.examples.educational.missing", `${path}.educationalExamples`, "Educational examples missing"));
    }
    if (concept.fictionExamples.length === 0) {
      issues.push(makeMessage("warning", "concept.examples.fiction.missing", `${path}.fictionExamples`, "Fiction examples missing"));
    }
  }

  return issues;
}

export function validateEvidence(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [index, concept] of pack.concepts.entries()) {
    const path = `concepts[${index}].evidence`;
    if (concept.evidence.minimum.length === 0) issues.push(makeMessage("error", "evidence.minimum.missing", `${path}.minimum`, "Every concept must contain minimum evidence"));
    if (concept.evidence.strong.length === 0) issues.push(makeMessage("error", "evidence.strong.missing", `${path}.strong`, "Every concept must contain strong evidence"));
    if (concept.evidence.weak.length === 0) issues.push(makeMessage("error", "evidence.weak.missing", `${path}.weak`, "Every concept must contain weak evidence"));
    if (concept.evidence.insufficient.length === 0) issues.push(makeMessage("error", "evidence.insufficient.missing", `${path}.insufficient`, "Every concept must contain insufficient evidence"));

    const tiers: Array<[string, readonly string[]]> = [
      ["minimum", concept.evidence.minimum],
      ["strong", concept.evidence.strong],
      ["weak", concept.evidence.weak],
      ["insufficient", concept.evidence.insufficient],
    ];
    for (const [tierName, entries] of tiers) {
      const normalized = entries.map(normalizeText);
      if (new Set(normalized).size !== normalized.length) {
        issues.push(makeMessage("error", `evidence.${tierName}.duplicate`, `${path}.${tierName}`, "No duplicate evidence entries"));
      }
    }
  }
  return issues;
}

export function validateExceptions(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [index, concept] of pack.concepts.entries()) {
    const path = `concepts[${index}]`;
    if (concept.exceptions.length === 0) {
      issues.push(makeMessage("error", "exceptions.missing", `${path}.exceptions`, "Every concept must define exceptions"));
    }
    if (concept.borderlineExamples.length === 0) {
      issues.push(makeMessage("warning", "exceptions.borderline.missing", `${path}.borderlineExamples`, "Borderline cases missing"));
    }
    if (concept.falsePositives.length === 0) {
      issues.push(makeMessage("warning", "exceptions.falsePositives.missing", `${path}.falsePositives`, "False positives missing"));
    }
    if (concept.falseNegatives.length === 0) {
      issues.push(makeMessage("warning", "exceptions.falseNegatives.missing", `${path}.falseNegatives`, "False negatives missing"));
    }
  }
  return issues;
}

export function validateReviewerQuestions(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  const requiredCategories = [
    "Narrative",
    "Speaker",
    "Target",
    "Intent",
    "Context",
    "Evidence",
    "Confidence",
  ];

  for (const [index, concept] of pack.concepts.entries()) {
    const categories = new Set(concept.reviewerQuestions.map((question) => normalizeText(question.category)));
    for (const category of requiredCategories) {
      if (![...categories].some((entry) => entry.toLowerCase().includes(category.toLowerCase()))) {
        issues.push(makeMessage("warning", "questions.category.missing", `concepts[${index}].reviewerQuestions`, `${category} question category missing`));
      }
    }
  }
  return issues;
}

export function validateGlossary(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  if (pack.glossary.length === 0) {
    issues.push(makeMessage("warning", "glossary.empty", "glossary", "Missing glossary"));
  }
  const seenIds = new Set<string>();
  const seenTerms = new Set<string>();

  for (const [index, entry] of pack.glossary.entries()) {
    const path = `glossary[${index}]`;
    const id = normalizeId(entry.id);
    const term = normalizeText(entry.term);
    if (!isNonEmptyString(entry.id)) {
      issues.push(makeMessage("error", "glossary.id.missing", `${path}.id`, "Glossary ID exists"));
    } else if (seenIds.has(id)) {
      issues.push(makeMessage("error", "glossary.id.duplicate", `${path}.id`, "Detect conflicting glossary IDs"));
    } else {
      seenIds.add(id);
    }
    if (!isNonEmptyString(entry.term)) {
      issues.push(makeMessage("error", "glossary.term.missing", `${path}.term`, "Glossary term exists"));
    } else if (seenTerms.has(term)) {
      issues.push(makeMessage("error", "glossary.term.duplicate", `${path}.term`, "Detect duplicated glossary entries"));
    } else {
      seenTerms.add(term);
    }
    if (!isNonEmptyString(entry.definition)) {
      issues.push(makeMessage("error", "glossary.definition.missing", `${path}.definition`, "Glossary definition exists"));
    }
  }

  const referenced = new Set(pack.concepts.flatMap((concept) => concept.glossaryIds.map(normalizeId)));
  for (const entry of pack.glossary) {
    if (!referenced.has(normalizeId(entry.id))) {
      issues.push(makeMessage("warning", "glossary.unused", "glossary", `Unused glossary entry: ${entry.term}`));
    }
  }
  return issues;
}

export function validateRelationships(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  const conceptIds = new Set(pack.concepts.map((concept) => normalizeId(concept.id)));
  const links = new Set<string>();

  for (const [index, relationship] of pack.relationships.entries()) {
    const path = `relationships[${index}]`;
    const parentId = normalizeId(relationship.parentConceptId);
    const childId = normalizeId(relationship.childConceptId);
    const key = `${parentId}|${childId}|${normalizeId(relationship.type)}`;
    if (!conceptIds.has(parentId)) issues.push(makeMessage("error", "relationships.parent.missing", `${path}.parentConceptId`, "Unknown parent"));
    if (!conceptIds.has(childId)) issues.push(makeMessage("error", "relationships.child.missing", `${path}.childConceptId`, "Missing referenced concepts"));
    if (parentId === childId) issues.push(makeMessage("error", "relationships.loop.self", path, "Relationship loops"));
    if (links.has(key)) issues.push(makeMessage("error", "relationships.duplicate", path, "Duplicate links"));
    links.add(key);
  }

  if (pack.concepts.length > 1 && pack.relationships.length === 0) {
    issues.push(makeMessage("warning", "relationships.orphan", "relationships", "Orphan concepts"));
  }

  return issues;
}

export function validateGcamMapping(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [conceptIndex, concept] of pack.concepts.entries()) {
    for (const [mappingIndex, mapping] of concept.articleMappings.entries()) {
      const path = `concepts[${conceptIndex}].articleMappings[${mappingIndex}]`;
      if (!Number.isInteger(mapping.articleId) || mapping.articleId <= 0) {
        issues.push(makeMessage("error", "gcam.articleId.missing", `${path}.articleId`, "Every concept mapped to a GCAM article must contain article ID"));
      }
      if (!isNonEmptyString(mapping.articleTitle)) {
        issues.push(makeMessage("error", "gcam.articleTitle.missing", `${path}.articleTitle`, "Every concept mapped to a GCAM article must contain article title"));
      }
      if (!isNonEmptyString(mapping.articleNumber)) {
        issues.push(makeMessage("error", "gcam.articleNumber.missing", `${path}.articleNumber`, "Every concept mapped to a GCAM article must contain article number"));
      }
      if (!isNonEmptyString(mapping.reportTitle)) {
        issues.push(makeMessage("error", "gcam.reportTitle.missing", `${path}.reportTitle`, "Every concept mapped to a GCAM article must contain report title"));
      }
    }
  }
  return issues;
}

export function validateReportTemplate(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [index, concept] of pack.concepts.entries()) {
    const path = `concepts[${index}].reportTemplate`;
    const template = concept.reportTemplate;
    if (!isNonEmptyString(template.findingTitle)) issues.push(makeMessage("error", "report.findingTitle.missing", `${path}.findingTitle`, "Report template must include finding title"));
    if (!isNonEmptyString(template.reasonTemplate)) issues.push(makeMessage("error", "report.reasonTemplate.missing", `${path}.reasonTemplate`, "Report template must include reason template"));
    if (!isNonEmptyString(template.recommendationTemplate)) issues.push(makeMessage("error", "report.recommendationTemplate.missing", `${path}.recommendationTemplate`, "Report template must include recommendation template"));
    if (!isNonEmptyString(template.severity)) issues.push(makeMessage("error", "report.severity.missing", `${path}.severity`, "Report template must include severity"));
    if (!Number.isFinite(template.priority)) issues.push(makeMessage("error", "report.priority.missing", `${path}.priority`, "Report template must include priority"));
    if (!isNonEmptyString(template.reportCategory)) issues.push(makeMessage("error", "report.category.missing", `${path}.reportCategory`, "Report template must include report category"));
  }
  return issues;
}

export function validateConfidence(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [index, concept] of pack.concepts.entries()) {
    const thresholds = concept.confidenceRules.map((rule) => rule.threshold);
    if (thresholds.some((threshold) => !Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
      issues.push(makeMessage("error", "confidence.range.invalid", `concepts[${index}].confidenceRules`, "0–100 range"));
    }
    const sorted = [...thresholds].sort((left, right) => left - right);
    if (JSON.stringify(sorted) !== JSON.stringify(thresholds)) {
      issues.push(makeMessage("error", "confidence.order.invalid", `concepts[${index}].confidenceRules`, "ordered thresholds"));
    }
    const duplicates = sorted.some((threshold, currentIndex) => currentIndex > 0 && threshold === sorted[currentIndex - 1]);
    if (duplicates) {
      issues.push(makeMessage("error", "confidence.duplicate.invalid", `concepts[${index}].confidenceRules`, "duplicate thresholds"));
    }
  }
  return issues;
}

export function validateExamples(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  for (const [index, concept] of pack.concepts.entries()) {
    const path = `concepts[${index}].examples`;
    if (concept.examples.length === 0) issues.push(makeMessage("warning", "examples.positive.missing", path, "positive examples missing"));
    if (concept.counterExamples.length === 0) issues.push(makeMessage("warning", "examples.negative.missing", `${path}.counterExamples`, "negative examples missing"));
    if (concept.borderlineExamples.length === 0) issues.push(makeMessage("warning", "examples.borderline.missing", `${path}.borderlineExamples`, "borderline examples missing"));
    if (concept.educationalExamples.length === 0) issues.push(makeMessage("warning", "examples.educational.missing", `${path}.educationalExamples`, "educational examples missing"));
    if (concept.fictionExamples.length === 0) issues.push(makeMessage("warning", "examples.fiction.missing", `${path}.fictionExamples`, "fiction examples missing"));
  }
  return issues;
}

export function validateDeterminism(pack: KnowledgeLintPack): KnowledgeLintMessage[] {
  const issues: KnowledgeLintMessage[] = [];
  const conceptIds = pack.concepts.map((concept) => normalizeId(concept.id));
  const sortedConceptIds = [...conceptIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(conceptIds) !== JSON.stringify(sortedConceptIds)) {
    issues.push(makeMessage("warning", "determinism.concepts.order", "concepts", "Stable ordering"));
  }

  const glossaryIds = pack.glossary.map((entry) => normalizeId(entry.id));
  const sortedGlossaryIds = [...glossaryIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(glossaryIds) !== JSON.stringify(sortedGlossaryIds)) {
    issues.push(makeMessage("warning", "determinism.glossary.order", "glossary", "Stable ordering"));
  }

  const relationships = pack.relationships.map((relationship) => `${normalizeId(relationship.parentConceptId)}|${normalizeId(relationship.childConceptId)}|${normalizeId(relationship.type)}`);
  const sortedRelationships = [...relationships].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(relationships) !== JSON.stringify(sortedRelationships)) {
    issues.push(makeMessage("warning", "determinism.relationships.order", "relationships", "Stable ordering"));
  }

  return issues;
}

export function computeCoverage(pack: KnowledgeLintPack): KnowledgeLintCoverage {
  const totalConcepts = Math.max(pack.concepts.length, 1);
  const questionCoverage = pack.concepts.reduce((sum, concept) => {
    const covered = new Set(concept.reviewerQuestions.map((question) => normalizeText(question.category)));
    const required = ["Narrative", "Speaker", "Target", "Intent", "Context", "Evidence", "Confidence"];
    const matches = required.filter((category) => [...covered].some((entry) => entry.toLowerCase().includes(category.toLowerCase()))).length;
    return sum + (matches / required.length) * 100;
  }, 0) / totalConcepts;
  const conceptCoverage = pack.concepts.reduce((sum, concept) => {
    const fields = [
      concept.definition,
      ...concept.examples,
      ...concept.counterExamples,
      ...concept.borderlineExamples,
      ...concept.educationalExamples,
      ...concept.fictionExamples,
      concept.reportTemplate.findingTitle,
      concept.reportTemplate.reasonTemplate,
      concept.reportTemplate.recommendationTemplate,
    ];
    const filled = fields.filter((value) => normalizeText(value).length > 0).length;
    return sum + (fields.length === 0 ? 0 : (filled / fields.length) * 100);
  }, 0) / totalConcepts;
  const evidenceCoverage = pack.concepts.reduce((sum, concept) => {
    const fields = [
      ...concept.evidence.minimum,
      ...concept.evidence.strong,
      ...concept.evidence.weak,
      ...concept.evidence.insufficient,
    ];
    return sum + (fields.length > 0 ? 100 : 0);
  }, 0) / totalConcepts;

  return Object.freeze({
    metadata: 100,
    concepts: conceptCoverage,
    evidence: evidenceCoverage,
    exceptions: pack.concepts.length > 0 ? 100 : 0,
    reviewerQuestions: questionCoverage,
    glossary: pack.glossary.length > 0 ? 100 : 0,
    relationships: pack.relationships.length > 0 ? 100 : 0,
    gcamMapping: pack.concepts.length > 0 && pack.concepts.every((concept) => concept.articleMappings.length > 0) ? 100 : 0,
    reportTemplate: conceptCoverage,
    confidence: pack.concepts.length > 0 ? 100 : 0,
    examples: pack.concepts.length > 0 ? 100 : 0,
  });
}

export function computeStatistics(pack: KnowledgeLintPack, issues: readonly KnowledgeLintMessage[]): KnowledgeLintStatistics {
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const duplicateCount = issues.filter((issue) => issue.code.includes("duplicate")).length;
  const unusedCount = issues.filter((issue) => issue.code.includes("unused")).length;
  const exampleCount = pack.concepts.reduce((sum, concept) => sum + concept.examples.length + concept.counterExamples.length + concept.borderlineExamples.length + concept.educationalExamples.length + concept.fictionExamples.length, 0);
  const coverage = computeCoverage(pack);
  const coveragePercentage = Number((
    Object.values(coverage).reduce((sum, value) => sum + value, 0) / Object.keys(coverage).length
  ).toFixed(3));
  const validationScore = Math.max(0, 100 - errorCount * 20 - warningCount * 2 - duplicateCount * 3 - unusedCount);
  return Object.freeze({
    conceptCount: pack.concepts.length,
    glossaryEntryCount: pack.glossary.length,
    exampleCount,
    relationshipCount: pack.relationships.length,
    coveragePercentage,
    validationScore,
    warningCount,
    errorCount,
    duplicateCount,
    unusedCount,
  });
}

export function computePackScore(statistics: KnowledgeLintStatistics, coverage: KnowledgeLintCoverage) {
  const completeness = Number((((coverage.metadata + coverage.concepts + coverage.evidence + coverage.exceptions + coverage.reviewerQuestions + coverage.glossary + coverage.relationships + coverage.gcamMapping + coverage.reportTemplate + coverage.confidence + coverage.examples) / 11)).toFixed(3));
  const consistency = Math.max(0, 100 - statistics.duplicateCount * 10 - statistics.errorCount * 2);
  const specificity = Math.max(0, 100 - statistics.warningCount);
  const score = Number((((completeness + consistency + specificity) / 3)).toFixed(3));
  return Object.freeze({ score, completeness, consistency, specificity });
}

export function computeOverallScore(statistics: KnowledgeLintStatistics, packScore: ReturnType<typeof computePackScore>) {
  const score = Number((((packScore.score + statistics.coveragePercentage + statistics.validationScore) / 3)).toFixed(3));
  return Object.freeze({
    score,
    readyForAcademy: statistics.errorCount === 0,
  });
}

export function sortLintMessages(messages: readonly KnowledgeLintMessage[]): readonly KnowledgeLintMessage[] {
  return sortBy(messages, (left, right) =>
    left.severity.localeCompare(right.severity) ||
    left.path.localeCompare(right.path) ||
    left.code.localeCompare(right.code) ||
    left.message.localeCompare(right.message),
  );
}
