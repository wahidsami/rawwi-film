import assert from "node:assert/strict";
import { calculateSeverity } from "./severityRulebook.js";

function run() {
  assert.equal(
    calculateSeverity({
      canonical_atom: "VIOLENCE",
      intensity: 3,
      context_impact: 2,
      legal_sensitivity: 3,
      audience_risk: 1,
    }),
    "medium",
    "Moderate violence should not escalate to high by default"
  );

  assert.equal(
    calculateSeverity({
      canonical_atom: "VIOLENCE",
      intensity: 4,
      context_impact: 3,
      legal_sensitivity: 3,
      audience_risk: 2,
    }),
    "high",
    "Severe violence should still reach high"
  );

  assert.equal(
    calculateSeverity({
      canonical_atom: "SEXUAL",
      intensity: 4,
      context_impact: 2,
      legal_sensitivity: 3,
      audience_risk: 1,
    }),
    "medium",
    "Strong but non-minor/non-graphic sexual content should no longer jump straight to high"
  );

  assert.equal(
    calculateSeverity({
      canonical_atom: "SEXUAL",
      intensity: 4,
      context_impact: 3,
      legal_sensitivity: 3,
      audience_risk: 3,
    }),
    "critical",
    "Graphic or coercive sexual content should remain critical"
  );

  console.log("All severity rulebook tests passed.");
}

run();
