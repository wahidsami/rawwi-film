/**
 * Regression tests for adaptive idle polling.
 * Run: node --import tsx apps/worker/src/idlePolling.test.ts
 */
import { strict as assert } from "node:assert";

import { resolveWorkerPollMode, shouldEnterIdleMode } from "./idlePolling.js";
import { config } from "./config.js";

function testEnterIdleModeOnlyWhenAllQueuesAreEmpty() {
  assert.equal(
    shouldEnterIdleMode({
      hasPendingExtraction: false,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    }),
    true,
    "worker should enter idle mode only when every work queue is empty",
  );
  assert.equal(
    shouldEnterIdleMode({
      hasPendingExtraction: true,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    }),
    false,
    "pending extraction must keep the worker active",
  );
  assert.equal(
    shouldEnterIdleMode({
      hasPendingExtraction: false,
      hasPendingAnalysis: true,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    }),
    false,
    "pending analysis must keep the worker active",
  );
  assert.equal(
    shouldEnterIdleMode({
      hasPendingExtraction: false,
      hasPendingAnalysis: false,
      hasAggregationCandidate: true,
      hasStaleJudgingChunks: false,
    }),
    false,
    "aggregation candidates must keep the worker active",
  );
  assert.equal(
    shouldEnterIdleMode({
      hasPendingExtraction: false,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: true,
    }),
    false,
    "stale judging chunks must keep the worker active",
  );
  console.log("✓ idle mode only activates when all work queues are empty");
}

function testResolveWorkerPollModeTransitions() {
  const active = resolveWorkerPollMode(
    {
      hasPendingExtraction: false,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    },
    false,
    config.POLL_INTERVAL_MS,
    config.IDLE_POLL_INTERVAL_MS,
  );
  assert.equal(active.idleMode, true, "worker should enter idle mode when no work exists");
  assert.equal(active.pollIntervalMs, config.IDLE_POLL_INTERVAL_MS, "idle interval should be selected in idle mode");
  assert.equal(active.transition, "enter", "first idle transition should be reported as enter");

  const stillIdle = resolveWorkerPollMode(
    {
      hasPendingExtraction: false,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    },
    true,
    config.POLL_INTERVAL_MS,
    config.IDLE_POLL_INTERVAL_MS,
  );
  assert.equal(stillIdle.idleMode, true, "worker should remain idle while no work exists");
  assert.equal(stillIdle.transition, null, "no transition should be reported when staying idle");

  const activeAgain = resolveWorkerPollMode(
    {
      hasPendingExtraction: true,
      hasPendingAnalysis: false,
      hasAggregationCandidate: false,
      hasStaleJudgingChunks: false,
    },
    true,
    config.POLL_INTERVAL_MS,
    config.IDLE_POLL_INTERVAL_MS,
  );
  assert.equal(activeAgain.idleMode, false, "any work should restore active polling");
  assert.equal(activeAgain.pollIntervalMs, config.POLL_INTERVAL_MS, "active interval should be restored");
  assert.equal(activeAgain.transition, "leave", "worker should report leaving idle mode once work returns");
  console.log("✓ poll mode transitions between active and idle intervals");
}

async function main() {
  testEnterIdleModeOnlyWhenAllQueuesAreEmpty();
  testResolveWorkerPollModeTransitions();
  console.log("\nAdaptive idle polling tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
