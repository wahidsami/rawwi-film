/**
 * Minimal tests for audit event payload (filters + pagination are exercised via API).
 * Run: npx tsx src/audit.test.ts (from apps/worker)
 */
import { logAuditEvent } from "./audit.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const inserted: unknown[] = [];
const mockSupabase = {
  from: (table: string) => ({
    insert: (row: unknown) => {
      if (table === "audit_events") inserted.push(row);
      return { single: () => ({ data: { id: "test-id" }, error: null }) };
    },
  }),
};

async function testAuditPayloadShape() {
  inserted.length = 0;
  await logAuditEvent(mockSupabase as any, {
    event_type: "ANALYSIS_COMPLETED",
    target_type: "task",
    target_id: "550e8400-e29b-41d4-a716-446655440000",
    target_label: "script-1",
  });
  assert(inserted.length === 1, "one row inserted");
  const row = inserted[0] as Record<string, unknown>;
  assert(row.event_type === "ANALYSIS_COMPLETED", "event_type");
  assert(row.target_type === "task", "target_type");
  assert(row.target_id === "550e8400-e29b-41d4-a716-446655440000", "target_id");
  assert(row.target_label === "script-1", "target_label");
  assert(row.result_status === "success", "result_status");
  assert(row.actor_role === "system", "actor_role");
  assert(typeof row.occurred_at === "string", "occurred_at ISO string");
  console.log("✓ Audit event payload shape (event_type, target_*, result_status, occurred_at)");
}

async function main() {
  await testAuditPayloadShape();
  console.log("All audit tests passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
