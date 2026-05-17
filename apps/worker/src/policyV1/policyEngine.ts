import type { SceneAnalysisResult, SceneEvent } from "./sceneEventSchema.js";

export type PolicyDecisionStatus = "violation" | "needs_review" | "rejected";

export interface PolicyDecision {
  decision_id: string;
  source_event_id: string;
  regulation_clause: string;
  status: PolicyDecisionStatus;
  reason_code: string;
  reason_text_ar: string;
  evidence_snippet: string;
}

function buildDecision(
  event: SceneEvent,
  clause: string,
  status: PolicyDecisionStatus,
  reasonCode: string,
  reasonTextAr: string,
): PolicyDecision {
  return {
    decision_id: `pd-${event.event_id}-${clause}`,
    source_event_id: event.event_id,
    regulation_clause: clause,
    status,
    reason_code: reasonCode,
    reason_text_ar: reasonTextAr,
    evidence_snippet: event.evidence_snippet,
  };
}

/**
 * Phase-1 deterministic policy stub.
 * This is intentionally conservative and can be expanded clause-by-clause in Phase 3.
 */
export function runPolicyEngine(input: SceneAnalysisResult): PolicyDecision[] {
  const out: PolicyDecision[] = [];

  for (const event of input.events) {
    // 2.2 Child/disability harm baseline
    if (
      (event.target_class === "child" || event.target_class === "person_with_disability") &&
      (event.event_type === "physical_abuse" || event.event_type === "verbal_abuse" || event.event_type === "bullying")
    ) {
      out.push(
        buildDecision(
          event,
          "2.2",
          "violation",
          "child_or_disability_harm",
          "المشهد يتضمن إيذاء/تنمرًا موجّهًا لفئة محمية (طفل أو شخص من ذوي الإعاقة).",
        ),
      );
      continue;
    }

    // 2.3 requires advocacy/promotion, not mere mention
    if (event.event_type === "sexual_content") {
      if (event.promoted || event.glorified || event.intent_signal === "advocacy") {
        out.push(
          buildDecision(
            event,
            "2.3",
            "violation",
            "positive_advocacy_detected",
            "المشهد يتضمن طرحًا إيجابيًا/دعائيًا يتجاوز مجرد الذكر المحايد.",
          ),
        );
      } else {
        out.push(
          buildDecision(
            event,
            "2.3",
            "rejected",
            "mere_mention_without_advocacy",
            "الحدث لا يحقق شرط الدعوة أو التجميل أو الإيجابية المنصوص عليه في الضابط.",
          ),
        );
      }
      continue;
    }

    // 1.4 documentary reliability gate
    if (event.event_type === "historical_claim") {
      if (event.documentary_context && event.factual_claim_present) {
        out.push(
          buildDecision(
            event,
            "1.4",
            "needs_review",
            "documentary_claim_requires_source_validation",
            "تم رصد ادعاء تاريخي في سياق وثائقي ويتطلب التحقق من التوثيق والمصادر المعتمدة.",
          ),
        );
      } else {
        out.push(
          buildDecision(
            event,
            "1.4",
            "rejected",
            "no_documentary_context",
            "الحدث تاريخي/ادعائي لكن لا يحقق شرط السياق الوثائقي اللازم لتطبيق هذا الضابط.",
          ),
        );
      }
      continue;
    }
  }

  return out;
}
