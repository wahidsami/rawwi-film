import type { PolicyDecision, PolicyDecisionStatus } from "./policyEngine.js";
import type { SceneEvent } from "./sceneEventSchema.js";

export interface ClauseRule {
  clause: string;
  evaluate: (event: SceneEvent) => PolicyDecisionStatus | null;
  reasonCode: (event: SceneEvent, status: PolicyDecisionStatus) => string;
  reasonAr: (event: SceneEvent, status: PolicyDecisionStatus) => string;
}

function makeDecision(
  event: SceneEvent,
  clause: string,
  status: PolicyDecisionStatus,
  reasonCode: string,
  reasonAr: string,
): PolicyDecision {
  return {
    decision_id: `pd-${event.event_id}-${clause}`,
    source_event_id: event.event_id,
    regulation_clause: clause,
    status,
    reason_code: reasonCode,
    reason_text_ar: reasonAr,
    evidence_snippet: event.evidence_snippet,
  };
}

export const CLAUSE_RULES: ClauseRule[] = [
  {
    clause: "2.2",
    evaluate: (event) => {
      const protectedTarget =
        event.target_class === "child" || event.target_class === "person_with_disability";
      const harmfulEvent =
        event.event_type === "physical_abuse" || event.event_type === "verbal_abuse" || event.event_type === "bullying";
      if (!protectedTarget || !harmfulEvent) return null;
      return "violation";
    },
    reasonCode: () => "child_or_disability_harm",
    reasonAr: () => "المشهد يتضمن إيذاء/تنمرًا موجّهًا لطفل أو لشخص من ذوي الإعاقة.",
  },
  {
    clause: "2.3",
    evaluate: (event) => {
      if (event.event_type !== "sexual_content") return null;
      if (event.promoted || event.glorified || event.intent_signal === "advocacy") return "violation";
      return "rejected";
    },
    reasonCode: (_event, status) =>
      status === "violation" ? "positive_advocacy_detected" : "mere_mention_without_advocacy",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "المشهد يتضمن دعوة/تجميل/طرحًا إيجابيًا يتجاوز الذكر المحايد."
        : "لا يتحقق شرط الدعوة أو التجميل أو الإيجابية؛ الذكر المجرد لا يكفي.",
  },
  {
    clause: "1.4",
    evaluate: (event) => {
      if (event.event_type !== "historical_claim") return null;
      if (event.documentary_context && event.factual_claim_present) return "needs_review";
      return "rejected";
    },
    reasonCode: (_event, status) =>
      status === "needs_review" ? "documentary_claim_requires_source_validation" : "no_documentary_context",
    reasonAr: (_event, status) =>
      status === "needs_review"
        ? "ادعاء تاريخي في سياق وثائقي يحتاج تحققًا من المصادر الموثقة والمعتمدة."
        : "الادعاء لا يحقق شرط السياق الوثائقي/الفactualي اللازم لتطبيق هذا البند.",
  },
];

export function evaluateClauseRules(event: SceneEvent): PolicyDecision[] {
  const out: PolicyDecision[] = [];
  for (const rule of CLAUSE_RULES) {
    const status = rule.evaluate(event);
    if (!status) continue;
    out.push(
      makeDecision(
        event,
        rule.clause,
        status,
        rule.reasonCode(event, status),
        rule.reasonAr(event, status),
      ),
    );
  }
  return out;
}

