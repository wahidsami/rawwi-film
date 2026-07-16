import assert from "node:assert/strict";

import { createProductionCertificationReport } from "./productionCertificationCoverage.js";
import { renderHumanReviewerAlignmentReport } from "./humanReviewerAlignmentRenderer.js";

const certification = createProductionCertificationReport();
const alignment = certification.coverageReports.humanReviewerAlignment;
const rendered = renderHumanReviewerAlignmentReport(alignment);

assert.equal(alignment.framework, "Human Reviewer Alignment Benchmark");
assert.equal(alignment.hash.length > 0, true);
assert.equal(alignment.recordCount > 0, true);
assert.equal(alignment.reviewerCount > 0, true);
assert.equal(alignment.reviewerScorecards.length > 0, true);
assert.equal(alignment.metrics.some((metric) => metric.id === "article_selection_accuracy"), true);
assert.equal(alignment.metrics.some((metric) => metric.id === "confidence_alignment"), true);
assert.equal(rendered, renderHumanReviewerAlignmentReport(alignment));
assert.equal(rendered.includes("Reviewer Scorecards"), true);
assert.equal(rendered.includes("Learning Priorities"), true);

console.log("Human reviewer alignment tests passed.");
