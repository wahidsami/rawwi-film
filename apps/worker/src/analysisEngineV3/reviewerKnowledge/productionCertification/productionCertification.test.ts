import assert from "node:assert/strict";

import { createProductionCertificationReport } from "./productionCertificationCoverage.js";
import { renderProductionCertificationReport } from "./productionCertificationRenderer.js";

const reportA = createProductionCertificationReport();
const renderedA = renderProductionCertificationReport(reportA);

assert.equal(reportA.framework, "V3 Production Certification");
assert.equal(reportA.hash.length > 0, true);
assert.equal(reportA.reviewerScorecards.length > 0, true);
assert.equal(reportA.coverageReports.reviewerDomains.length > 0, true);
assert.equal(reportA.coverageReports.humanReviewerAlignment.recordCount > 0, true);
assert.equal(reportA.metrics.some((metric) => metric.id === "reviewer_precision"), true);
assert.equal(reportA.metrics.some((metric) => metric.id === "continuous_learning_growth"), true);
assert.equal(reportA.metrics.some((metric) => metric.id === "human_reviewer_alignment"), true);
assert.equal(renderedA, renderProductionCertificationReport(reportA));
assert.equal(renderedA.includes("Production Certification"), true);
assert.equal(renderedA.includes("Reviewer Scorecards"), true);
assert.equal(renderedA.includes("Module Scorecards"), true);
assert.equal(renderedA.includes("Knowledge Scorecards"), true);
assert.equal(renderedA.includes("Readiness Reports"), true);
assert.equal(renderedA.includes("Human Reviewer Alignment"), true);

console.log("Production certification tests passed.");
