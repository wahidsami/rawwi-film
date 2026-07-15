/**
 * Guardrail test for the V3 chunk lifecycle.
 * Run: node --import tsx apps/worker/src/pipeline.v3-completion.test.ts
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function main(): void {
  const sourcePath = join(process.cwd(), "apps", "worker", "src", "pipeline.ts");
  const source = readFileSync(sourcePath, "utf8");

  const v3BranchStart = source.indexOf('if (analysisEngine === "v3") {');
  assert(v3BranchStart >= 0, "expected V3 branch in pipeline.ts");

  const completionMarker = 'logger.info("V3 runtime adapter completed"';
  const completionMarkerIndex = source.indexOf(completionMarker, v3BranchStart);
  assert(completionMarkerIndex >= 0, "expected V3 runtime completion log");

  const setChunkDoneIndex = source.indexOf("await setChunkDone(chunk.id);", v3BranchStart);
  assert(setChunkDoneIndex >= 0, "expected shared completion path to call setChunkDone");
  assert(setChunkDoneIndex > completionMarkerIndex, "setChunkDone must occur after V3 runtime completion");

  const v3BranchEnd = source.indexOf("\n    } else {", v3BranchStart);
  assert(v3BranchEnd > completionMarkerIndex, "expected legacy branch to begin after the V3 branch");

  const tail = source.slice(completionMarkerIndex, v3BranchEnd);
  assert(!/\breturn;\b/.test(tail), "V3 branch must not return before the shared completion lifecycle");

  console.log("✓ V3 pipeline completion lifecycle reaches shared setChunkDone path");
}

main();
