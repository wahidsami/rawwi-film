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
      "Enumerate every suspicious sentence in the chunk.",
      "Analyze each suspicious sentence independently.",
      "Does literal evidence exist?",
      "Is evidence admissible?",
      "Who is speaking?",
      "Is the statement literal?",
      "Is it quoted?",
      "Is it narrated?",
      "Is it educational?",
      "Is it condemnation?",
      "Does the legal module apply?",
      "Does an exception apply?",
      "Produce finding?",
    ],
    nodes: [
      { id: "evidence", type: "evidence", title: "Evidence Node", purpose: "Identify literal evidence.", inputs: ["chunk"], outputs: ["candidate_evidence"], exitConditions: ["No evidence"], downstreamNodes: ["narrative"] },
      { id: "narrative", type: "narrative", title: "Narrative Node", purpose: "Understand who is speaking and what the sentence means.", inputs: ["chunk", "story_memory"], outputs: ["narrative_result"], downstreamNodes: ["context"] },
      { id: "context", type: "context", title: "Context Node", purpose: "Interpret the evidence using local and story context.", inputs: ["chunk", "narrative_result", "candidate_evidence"], outputs: ["context_result"], downstreamNodes: ["legal"] },
      { id: "legal", type: "legal", title: "Legal Node", purpose: "Apply the legal module.", inputs: ["semantic_result", "narrative_result", "candidate_evidence", "context_result"], outputs: ["legal_decision"], downstreamNodes: ["exception"] },
      { id: "exception", type: "exception", title: "Exception Node", purpose: "Apply exclusions and exceptions.", inputs: ["semantic_result", "narrative_result", "candidate_evidence", "context_result", "legal_decision"], outputs: ["finding_eligibility"], downstreamNodes: ["reporting"] },
      { id: "reporting", type: "reporting", title: "Reporting Node", purpose: "Serialize the output-ready analysis response.", inputs: ["legal_decision", "candidate_evidence", "context_result"], outputs: ["analysis_response"] },
    ],
    edges: [
      { from: "evidence", to: "narrative", allowed: true, reason: "Evidence precedes narrative interpretation." },
      { from: "narrative", to: "context", allowed: true, reason: "Narrative understanding informs context." },
      { from: "context", to: "legal", allowed: true, reason: "Context informs legal evaluation." },
      { from: "legal", to: "exception", allowed: true, reason: "Exceptions follow a legal signal." },
      { from: "exception", to: "reporting", allowed: true, reason: "Reporting follows final eligibility." },
    ],
    globalExitConditions: [
      "No evidence",
      "Exception applies",
      "Module mismatch",
      "Insufficient confidence",
      "Ambiguous context",
      "All suspicious sentences have been analyzed.",
    ],
    evidencePriority: ["Literal Chunk", "Dialogue", "Narration", "Scene Description", "Story Memory", "Glossary"],
    contextPriority: ["Chunk", "Local Sentences", "Scene Memory", "Story Memory", "Glossary"],
    example: "Does literal evidence exist? -> Is evidence admissible? -> Produce finding?",
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
