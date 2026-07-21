import type { ExplanationEngineInput } from "./explanationTypes.js";

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function buildExplanationPrompt(input: ExplanationEngineInput): string {
  const concepts = input.conceptCollection?.concepts ?? [];
  const decisions = input.legalDecisionCollection?.decisions ?? [];
  const evidenceLines = (input.evidenceCollection?.evidence ?? []).map((evidence) => `- ${evidence.id}: ${normalizeText(evidence.text ?? evidence.rawText ?? "")}`);
  const conceptLines = concepts.map((concept) => `- ${concept.conceptId}: ${concept.conceptName} [${concept.severity}]`);
  const decisionLines = decisions.map((decision) => `- ${decision.id}: concept=${decision.conceptId}, article=${decision.primaryArticle?.articleId ?? "n/a"}`);

  return [
    "Explain the grounded findings using only the supplied evidence, concepts, and legal decisions.",
    `Scene: ${input.sceneId}`,
    input.sceneSummary.length > 0 ? `Scene summary: ${normalizeText(input.sceneSummary)}` : "Scene summary: n/a",
    "Evidence:",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- none"]),
    "Concepts:",
    ...(conceptLines.length > 0 ? conceptLines : ["- none"]),
    "Legal decisions:",
    ...(decisionLines.length > 0 ? decisionLines : ["- none"]),
    "Return a grounded explanation for each legal decision with: reasoning, recommendedAction, and confidence.",
    "Do not invent evidence, concepts, articles, scenes, or characters.",
  ].join("\n");
}
