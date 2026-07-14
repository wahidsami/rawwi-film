import { strict as assert } from "node:assert";

import { collectReasoningTraceStages, createEmptyReasoningTraceStage } from "../collector/reasoningTraceComparatorCollector.js";
import { buildReasoningTraceTimeline } from "../timeline/reasoningTraceTimeline.js";
import { REASONING_TRACE_STAGE_ORDER } from "../types/reasoningTraceTypes.js";
import { buildReasoningTraceFixtures } from "./reasoningTraceFixtures.js";

function testNormalization(): void {
  const fixtures = buildReasoningTraceFixtures();
  const shuffled = collectReasoningTraceStages([
    fixtures.actual[4],
    fixtures.actual[0],
    fixtures.actual[1],
  ]);

  assert.equal(shuffled[0].stage, REASONING_TRACE_STAGE_ORDER[0]);
  assert.equal(shuffled[1].stage, REASONING_TRACE_STAGE_ORDER[1]);
  assert.equal(shuffled[2].stage, REASONING_TRACE_STAGE_ORDER[4]);

  const empty = createEmptyReasoningTraceStage("final_report", 22);
  assert.equal(empty.stage, "final_report");
  assert.equal(empty.title, "Final Report");
  assert.equal(empty.inputs.length, 0);
  assert.equal(empty.confidence, 0);
  console.log("✓ reasoning trace normalization preserves deterministic order");
}

function testTimeline(): void {
  const fixtures = buildReasoningTraceFixtures();
  const timeline = buildReasoningTraceTimeline(fixtures.actual);
  const rendered = buildReasoningTraceTimeline(fixtures.actual);

  assert.equal(timeline.hash, rendered.hash);
  assert.equal(timeline.entries.length, fixtures.actual.length);
  assert.equal(timeline.entries[0].order, 0);
  assert.equal(timeline.entries[0].stage, "raw_script_input");
  assert.equal(timeline.entries.at(-1)?.stage, "final_report");
  console.log("✓ reasoning trace timeline is deterministic");
}

async function main(): Promise<void> {
  testNormalization();
  testTimeline();
  console.log("\nAll reasoning trace tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
