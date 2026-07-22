import assert from "node:assert/strict";
import { mapAnalysisFindingsForPdf } from "./mapper.ts";
import type { AnalysisFinding } from "../../../api";

function testAnalysisPdfMapperIgnoresSummaryFallbacks() {
  const findings: AnalysisFinding[] = [];
  const mapped = mapAnalysisFindingsForPdf(
    findings,
    [
      {
        article_id: 11,
        top_findings: [
          {
            title_ar: "summary-only",
            severity: "high",
            confidence: 0.9,
            evidence_snippet: "summary evidence",
          },
        ],
      },
    ],
    [
      {
        canonical_finding_id: "summary-canonical",
        title_ar: "summary canonical",
        evidence_snippet: "summary canonical evidence",
        severity: "high",
        confidence: 0.9,
        primary_article_id: 11,
      },
    ],
  );

  assert.equal(mapped.length, 0, "Summary fallbacks must not produce mapped PDF findings");
}

function main() {
  testAnalysisPdfMapperIgnoresSummaryFallbacks();
  console.log("✓ Analysis PDF mapper ignores summary fallback sources");
}

main();
