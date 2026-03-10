import type { AuditEventRow } from "@/services/auditService";

export type AuditPdfRow = {
  eventType: string;
  actor: string;
  when: string;
  target: string;
  result: string;
  details: string;
};

export function mapAuditDataForPdf(events: AuditEventRow[]): AuditPdfRow[] {
  return (events || []).filter(Boolean).map((e) => ({
    eventType: e.eventType || "",
    actor: `${e.actorName || "—"}${e.actorRole ? ` (${e.actorRole})` : ""}`,
    when: e.occurredAt || "",
    target: `${e.targetType || ""}${e.targetLabel ? ` - ${e.targetLabel}` : ""}`,
    result: e.resultStatus || "",
    details: e.metadata ? JSON.stringify(e.metadata).slice(0, 120) : "",
  }));
}
