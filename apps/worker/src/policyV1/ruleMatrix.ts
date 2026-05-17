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
        : "الادعاء لا يحقق شرط السياق الوثائقي/الوقائعي اللازم لتطبيق هذا البند.",
  },
  {
    clause: "1.3",
    evaluate: (event) => {
      if (event.event_type !== "national_security_reference") return null;
      const directIncitement =
        event.intent_signal === "advocacy" || event.promoted || event.glorified;
      if (directIncitement) return "violation";
      if (event.intent_signal === "factual_claim") return "needs_review";
      return "rejected";
    },
    reasonCode: (_event, status) =>
      status === "violation"
        ? "national_security_advocacy_or_glorification"
        : status === "needs_review"
          ? "national_security_claim_requires_context_review"
          : "no_incitement_or_promotion_signal",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "المشهد يتضمن تحريضًا/ترويجًا يمس الأمن الوطني بصورة مباشرة أو ضمنية."
        : status === "needs_review"
          ? "الإشارة تمس الأمن الوطني لكنها تتطلب مراجعة سياقية قبل اعتماد المخالفة."
          : "لا يظهر في الحدث تحريض أو ترويج كافٍ لتطبيق هذا البند.",
  },
  {
    clause: "1.6",
    evaluate: (event) => {
      if (event.event_type !== "national_security_reference") return null;
      if (event.target_class !== "child") return null;
      if (event.promoted || event.glorified || event.intent_signal === "advocacy") return "violation";
      return "rejected";
    },
    reasonCode: (_event, status) =>
      status === "violation"
        ? "child_oriented_security_crime_glamorization"
        : "child_context_without_positive_framing",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "المشهد يقدّم محتوى أمني/جرمي موجّهًا للأطفال بإطار إيجابي أو تجميلي."
        : "الحدث لا يحقق شرط الترويج/التجميل الإيجابي المطلوب لتطبيق هذا البند.",
  },
  {
    clause: "2.1",
    evaluate: (event) => {
      if (event.event_type !== "drug_or_alcohol") return null;
      if (event.intent_signal === "instruction") return "violation";
      if (event.promoted || event.glorified) return "needs_review";
      return "rejected";
    },
    reasonCode: (_event, status) =>
      status === "violation"
        ? "drug_or_alcohol_instructional_content"
        : status === "needs_review"
          ? "drug_or_alcohol_positive_framing_requires_review"
          : "no_instructional_signal",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "الحدث يتضمن محتوى تعليميًا مباشرًا أو ضمنيًا حول صناعة المخدرات/المسكرات."
        : status === "needs_review"
          ? "الحدث يتضمن إيحاءً إيجابيًا متعلقًا بالمخدرات/المسكرات ويستلزم مراجعة."
          : "لا يظهر في الحدث عنصر تعليمي كافٍ لتطبيق هذا البند.",
  },
  {
    clause: "2.4",
    evaluate: (event) => {
      if (event.event_type !== "sexual_content") return null;
      const explicitSignal =
        event.action_mode === "action" || event.action_mode === "visual";
      if (explicitSignal && (event.promoted || event.glorified || event.framing !== "unclear")) {
        return "violation";
      }
      return "needs_review";
    },
    reasonCode: (_event, status) =>
      status === "violation" ? "explicit_sexual_practice_signal" : "sexual_content_requires_explicitness_review",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "المشهد يتضمن إظهارًا صريحًا لممارسة جنسية وفق مؤشرات الفعل/العرض المباشر."
        : "المحتوى الجنسي مرصود لكنه يحتاج تحققًا إضافيًا من مستوى الصراحة قبل اعتماده.",
  },
  {
    clause: "2.5",
    evaluate: (event) => {
      if (event.event_type !== "verbal_abuse") return null;
      const bullyingOrTargeted =
        event.target_class === "child" ||
        event.target_class === "person_with_disability";
      if (bullyingOrTargeted) return "rejected";
      return "violation";
    },
    reasonCode: (_event, status) =>
      status === "violation" ? "profanity_or_insult_expression" : "redirect_to_more_specific_harm_clause",
    reasonAr: (_event, status) =>
      status === "violation"
        ? "الحدث يتضمن ألفاظًا نابية/مهينة تدخل ضمن نطاق الألفاظ غير اللائقة."
        : "تم رفض الإسناد لهذا البند لأن الحدث أقرب لبند ضرر نوعي أكثر تحديدًا.",
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
