import assert from "node:assert/strict";
import { attachV3DiagnosticReport } from "./reportMapper.js";

function testAttachV3DiagnosticReportDoesNotMutateFrozenMeta(): void {
  const diagnosticReport = Object.freeze({
    enabled: true,
    providerFindingsCount: 1,
  });
  const truthLayerMeta = Object.freeze({
    architecture: "v3_runtime_adapter",
    stage: "reasoning",
    findings_count: 1,
  });

  const attached = attachV3DiagnosticReport(truthLayerMeta, diagnosticReport);

  assert.equal(Object.isFrozen(truthLayerMeta), true);
  assert.equal("v3_diagnostic_report" in truthLayerMeta, false);
  assert.equal(attached.v3_diagnostic_report, diagnosticReport);
  assert.equal(attached.architecture, "v3_runtime_adapter");
  assert.equal(attached.stage, "reasoning");
}

function main(): void {
  testAttachV3DiagnosticReportDoesNotMutateFrozenMeta();
  console.log("✓ report mapper attaches diagnostic reports immutably");
}

main();
