import { V3_REASONING_STAGE_SEQUENCE } from "../reasoning/contract.js";
import type {
  V3PromptDecisionGraph,
  V3PromptReasoningContract,
  V3PromptSemanticLayer,
} from "../builder/builderTypes.js";
import type { AnalysisHooks } from "./analysisHooks.js";
import type { LegalModuleRegistry } from "../legal/legalModuleRegistry.js";
import { LegalModuleRegistry as Registry } from "../legal/legalModuleRegistry.js";
import { PROFANITY_MODULE } from "../legal/modules/profanity/profanityModule.js";
import { RELIGION_MODULE } from "../legal/modules/religion/religionModule.js";
import { NATIONAL_SECURITY_MODULE } from "../legal/modules/nationalSecurity/nationalSecurityModule.js";
import { STATE_LEADERSHIP_MODULE } from "../legal/modules/stateLeadership/stateLeadershipModule.js";
import { CHILDREN_MODULE } from "../legal/modules/children/childrenModule.js";
import { VIOLENCE_MODULE } from "../legal/modules/violence/violenceModule.js";
import { SEXUALITY_MODULE } from "../legal/modules/sexuality/sexualityModule.js";
import { DRUGS_MODULE } from "../legal/modules/drugs/drugsModule.js";
import { SOCIETY_MODULE } from "../legal/modules/society/societyModule.js";
import { FAMILY_VALUES_MODULE } from "../legal/modules/familyValues/familyValuesModule.js";
import { HISTORY_MODULE } from "../legal/modules/history/historyModule.js";
import { POLITICS_MODULE } from "../legal/modules/politics/politicsModule.js";
import { CRIME_MODULE } from "../legal/modules/crime/crimeModule.js";
import { TRAVEL_MODULE } from "../legal/modules/travel/travelModule.js";

export type AnalysisEngineConfig = Readonly<{
  reasoningContract: V3PromptReasoningContract;
  decisionGraph: V3PromptDecisionGraph;
  semanticLayer: V3PromptSemanticLayer;
  registry: LegalModuleRegistry;
  hooks?: AnalysisHooks;
  diagnostics?: Readonly<{ enabled?: boolean }>;
}>;

function buildReasoningContract(): V3PromptReasoningContract {
  return {
    title: "Reasoning Contract",
    overview: "The shared V3 reasoning contract.",
    principles: [
      "Narrative before legality.",
      "Evidence before interpretation.",
      "Story Memory explains evidence.",
      "Story Memory never becomes evidence.",
      "Glossary is knowledge, not classification.",
      "Legal reasoning happens after narrative understanding.",
      "Reporting never changes findings.",
      "Your task is to find all policy violations.",
      "Do not stop after finding one exception.",
      "Analyze every threatening, abusive, violent, sexual, political, religious, criminal, or profane statement independently.",
      "Never invent facts.",
    ],
    stages: V3_REASONING_STAGE_SEQUENCE.map((stage) => ({
      key: stage.name,
      title: stage.name.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      purpose: stage.purpose,
      description: stage.description,
      inputs: stage.inputs,
      outputs: stage.outputs,
    })),
  };
}

function buildDecisionGraph(): V3PromptDecisionGraph {
  return {
    title: "Decision Graph",
    overview: "Global decision architecture for Analysis Engine V3.",
    globalFlow: [
      "Extract the smallest grounded evidence span.",
      "Freeze the evidence before interpretation.",
      "Judge only what is literally visible in the evidence.",
      "Derive concepts only from the grounded evidence.",
      "Map concepts to knowledge domains and candidate GCAM articles.",
      "Classify the legal consequence.",
      "Generate an explanation that stays inside the grounded evidence.",
      "Validate that the explanation still matches the evidence and classification.",
    ],
    nodes: [
      { id: "evidence", type: "evidence", title: "Evidence Extraction Node", purpose: "Extract and freeze the smallest grounded evidence span.", inputs: ["chunk"], outputs: ["grounded_evidence"], exitConditions: ["No grounded evidence"], downstreamNodes: ["narrative"] },
      { id: "narrative", type: "narrative", title: "Evidence Judge Node", purpose: "Judge only the literal facts visible in the grounded evidence.", inputs: ["grounded_evidence"], outputs: ["observed_facts"], downstreamNodes: ["context"] },
      { id: "context", type: "context", title: "Concept Identification Node", purpose: "Derive concepts only from the grounded evidence and evidence judge output.", inputs: ["grounded_evidence", "observed_facts"], outputs: ["concept_result"], downstreamNodes: ["legal"] },
      { id: "legal", type: "legal", title: "Legal Classification Node", purpose: "Map the detected concepts to candidate GCAM articles and atoms.", inputs: ["grounded_evidence", "observed_facts", "concept_result"], outputs: ["legal_decision"], downstreamNodes: ["exception"] },
      { id: "exception", type: "exception", title: "Explanation Node", purpose: "Generate an explanation that only references the grounded evidence and selected article.", inputs: ["grounded_evidence", "concept_result", "legal_decision"], outputs: ["analysis_explanation"], downstreamNodes: ["reporting"] },
      { id: "reporting", type: "reporting", title: "Consistency Validation Node", purpose: "Validate that the explanation still matches the evidence and classification.", inputs: ["grounded_evidence", "concept_result", "legal_decision", "analysis_explanation"], outputs: ["validated_finding"] },
    ],
    edges: [
      { from: "evidence", to: "narrative", allowed: true, reason: "Evidence must be frozen before it is judged." },
      { from: "narrative", to: "context", allowed: true, reason: "The evidence judge feeds concept identification." },
      { from: "context", to: "legal", allowed: true, reason: "Concepts drive candidate article classification." },
      { from: "legal", to: "exception", allowed: true, reason: "Legal classification precedes explanation generation." },
      { from: "exception", to: "reporting", allowed: true, reason: "Explanation is validated before final emission." },
    ],
    globalExitConditions: [
      "No grounded evidence",
      "No concepts detected",
      "No legal article selected",
      "Explanation is inconsistent with evidence",
      "All suspicious sentences have been analyzed.",
    ],
    evidencePriority: ["Literal Chunk", "Dialogue", "Narration", "Scene Description"],
    contextPriority: ["Chunk", "Local Sentences", "Glossary"],
    example: "Extract grounded evidence -> Judge literal facts -> Identify concepts -> Classify law -> Explain -> Validate",
  };
}

function buildSemanticLayer(): V3PromptSemanticLayer {
  return {
    title: "Semantic Interpretation Layer",
    purpose: "Transform literal evidence into semantic meaning before legal evaluation.",
    meaningQuestions: [
      "Who is speaking?",
      "Who is being addressed?",
      "Who is being described?",
      "Is the sentence dialogue, narration, scene description, dream, flashback, satire, comedy, training, historical quotation, news, educational, instruction, threat, warning, joke, sarcasm, or irony?",
    ],
    narrativeIntentOptions: [
      "Approval",
      "Condemnation",
      "Neutrality",
      "Observation",
      "Instruction",
      "Promotion",
      "Threat",
      "Mockery",
      "Praise",
      "Warning",
      "Education",
      "Humor",
      "Fiction",
      "Reality",
      "Unknown",
    ],
    conversationRoles: ["Speaker", "Listener", "Target", "Victim"],
    sceneRoles: ["Dialogue", "Narration", "Scene Description", "Documentary"],
    outputs: ["Semantic Meaning", "Narrative Intent", "Conversation Role", "Scene Role", "Target", "Victim", "Speaker", "Listener", "Emotion", "Risk Context", "Confidence"],
    states: ["Literal", "Quoted", "Narrated", "Satire", "Comedy", "Instruction", "Historical", "Dream", "Flashback"],
    signals: ["Story Memory", "Scene Memory", "Neighboring dialogue", "Later dialogue reversal"],
    examples: {
      good: ["A quoted warning in dialogue", "A narration line describing a scene"],
      bad: ["A legal verdict inside the semantic layer"],
      edgeCases: ["Narration that quotes dialogue", "Educational explanation of profanity"],
      falsePositives: ["Treating a quote as endorsement"],
      falseNegatives: ["Missing a direct insult in plain dialogue"],
    },
    notes: ["The semantic layer must explain meaning, not legality."],
  };
}

export function createDefaultAnalysisEngineConfig(overrides?: Partial<AnalysisEngineConfig>): AnalysisEngineConfig {
  const registry = overrides?.registry ?? new Registry().register(PROFANITY_MODULE).register(RELIGION_MODULE).register(STATE_LEADERSHIP_MODULE).register(NATIONAL_SECURITY_MODULE).register(CHILDREN_MODULE).register(VIOLENCE_MODULE).register(SEXUALITY_MODULE).register(DRUGS_MODULE).register(SOCIETY_MODULE).register(FAMILY_VALUES_MODULE).register(HISTORY_MODULE).register(POLITICS_MODULE).register(CRIME_MODULE).register(TRAVEL_MODULE);
  return {
    reasoningContract: overrides?.reasoningContract ?? buildReasoningContract(),
    decisionGraph: overrides?.decisionGraph ?? buildDecisionGraph(),
    semanticLayer: overrides?.semanticLayer ?? buildSemanticLayer(),
    registry,
    hooks: overrides?.hooks,
    diagnostics: overrides?.diagnostics ?? { enabled: false },
  };
}
