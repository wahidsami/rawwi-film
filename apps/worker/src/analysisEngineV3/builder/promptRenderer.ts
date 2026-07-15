import { createHash } from "node:crypto";
import { normalizePromptBuilderInput } from "./builderContext.js";
import { renderChunkContextSection, renderStoryMemorySection } from "./contextAssembler.js";
import { renderOutputSchemaSection } from "./outputAssembler.js";
import { renderReasoningStageAssembly } from "./stageAssembler.js";
import { renderSemanticLayerSection } from "./semanticAssembler.js";
import { joinPromptSections, renderListSection, renderRawSection, renderSection, renderStableJsonSection, renderStructuredSection } from "./sectionAssembler.js";
import type { V3PromptBuilderInput, V3RenderedPrompt } from "./builderTypes.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { renderReviewerMethodologySection } from "../reviewerMethodology/reviewerMethodologyRenderer.js";
import { getDefaultReviewerQuestionSet, renderReviewerQuestionSetSection, createDefaultReviewerQuestionRegistry } from "../reviewerQuestions/index.js";
import { selectReviewerKnowledgePacks } from "../reviewerKnowledge/reviewerKnowledgeSelector.js";
import { createDefaultReviewerKnowledgeRegistry } from "../reviewerKnowledge/reviewerKnowledgeRegistry.js";
import { renderReviewerKnowledgePacksSection } from "../reviewerKnowledge/reviewerKnowledgeRenderer.js";
import { buildReviewerReasoningEnginePayload } from "./reviewerReasoningEngine.js";

function renderDecisionGraphSection(decisionGraph: V3PromptBuilderInput["decisionGraph"]): string {
  const nodeSections = decisionGraph.nodes.map((node) =>
    renderSection(
      `${node.type.toUpperCase()} NODE: ${node.title}`,
      joinPromptSections([
        `- id: ${node.id}`,
        `- purpose: ${node.purpose}`,
        node.inputs && node.inputs.length > 0 ? renderListSection("Inputs", node.inputs) : null,
        node.outputs && node.outputs.length > 0 ? renderListSection("Outputs", node.outputs) : null,
        node.possibleBranches && node.possibleBranches.length > 0
          ? renderStructuredSection("Possible Branches", node.possibleBranches)
          : null,
        node.exitConditions && node.exitConditions.length > 0 ? renderListSection("Exit Conditions", node.exitConditions) : null,
        node.downstreamNodes && node.downstreamNodes.length > 0 ? renderListSection("Downstream Nodes", node.downstreamNodes) : null,
      ]),
    ),
  );

  const edgeSections = (decisionGraph.edges ?? []).map((edge) =>
    renderRawSection(
      `${edge.from} -> ${edge.to}`,
      joinPromptSections([
        edge.label ? `- label: ${edge.label}` : null,
        edge.condition ? `- condition: ${edge.condition}` : null,
        edge.allowed === undefined ? null : `- allowed: ${String(edge.allowed)}`,
        edge.reason ? `- reason: ${edge.reason}` : null,
      ]),
    ),
  );

  return renderSection(
    decisionGraph.title,
    joinPromptSections([
      decisionGraph.overview ? renderSection("Overview", decisionGraph.overview) : null,
      decisionGraph.globalFlow && decisionGraph.globalFlow.length > 0 ? renderListSection("Global Flow", decisionGraph.globalFlow) : null,
      decisionGraph.globalExitConditions && decisionGraph.globalExitConditions.length > 0
        ? renderListSection("Global Exit Conditions", decisionGraph.globalExitConditions)
        : null,
      decisionGraph.evidencePriority && decisionGraph.evidencePriority.length > 0
        ? renderListSection("Evidence Priority", decisionGraph.evidencePriority)
        : null,
      decisionGraph.contextPriority && decisionGraph.contextPriority.length > 0
        ? renderListSection("Context Priority", decisionGraph.contextPriority)
        : null,
      renderSection("Node Catalog", nodeSections.join("\n\n")),
      edgeSections.length > 0 ? renderSection("Edge Catalog", edgeSections.join("\n\n")) : null,
      decisionGraph.example ? renderRawSection("Example Decision Graph", decisionGraph.example) : null,
    ]),
  );
}

export function renderV3Prompt(input: V3PromptBuilderInput): string {
  const context = normalizePromptBuilderInput(input);
  const conceptContext = createPromptConceptContext(context);
  const reviewerAssessment = runReviewerMethodology({ promptInput: context, conceptContext });
  const universalKnowledgePack = createDefaultReviewerKnowledgeRegistry().load("v3_00_universal");
  const reviewerQuestionRegistry = createDefaultReviewerQuestionRegistry();
  const reviewerQuestionSet = universalKnowledgePack?.default_question_set_id
    ? reviewerQuestionRegistry.load(universalKnowledgePack.default_question_set_id) ?? getDefaultReviewerQuestionSet()
    : getDefaultReviewerQuestionSet();
  const reviewerKnowledgePacks = selectReviewerKnowledgePacks(reviewerAssessment, conceptContext);
  const reviewerReasoningEngine = buildReviewerReasoningEnginePayload(context, conceptContext, reviewerAssessment, reviewerKnowledgePacks);
  const reviewerMethodology = getDefaultReviewerMethodology();

  return joinPromptSections([
    "# Analysis Engine V3 System Prompt",
    renderReviewerMethodologySection(reviewerMethodology, reviewerAssessment),
    renderReviewerQuestionSetSection(reviewerQuestionSet),
    renderReviewerKnowledgePacksSection(reviewerKnowledgePacks),
    renderStableJsonSection("Reviewer Reasoning Engine", reviewerReasoningEngine),
    renderReasoningStageAssembly(context.reasoningContract),
    renderDecisionGraphSection(context.decisionGraph),
    renderSemanticLayerSection(context.semanticLayer),
    renderStoryMemorySection(context),
    renderChunkContextSection(context),
    renderGlossarySection(context),
    renderSubjectModuleSection(context),
    renderOutputSchemaSection(context.outputSchema),
  ]);
}

export function renderPromptHash(renderedPrompt: string): string {
  return createHash("sha256").update(renderedPrompt, "utf8").digest("hex");
}

export function renderV3RenderedPrompt(input: V3PromptBuilderInput): V3RenderedPrompt {
  const prompt = renderV3Prompt(input);
  return {
    prompt,
    promptHash: renderPromptHash(prompt),
  };
}

function renderGlossarySection(context: ReturnType<typeof normalizePromptBuilderInput>): string {
  const entries = context.glossary.entries.map((entry) => ({
    articleId: entry.articleId ?? null,
    definition: entry.definition ?? null,
    term: entry.term,
    variants: entry.variants ?? [],
  }));

  return renderSection(
    context.glossary.title,
    joinPromptSections([
      context.glossary.notes && context.glossary.notes.length > 0 ? renderListSection("Notes", context.glossary.notes) : null,
      renderStableJsonSection("Glossary Entries", entries),
    ]),
  );
}

function renderSubjectModuleSection(context: ReturnType<typeof normalizePromptBuilderInput>): string {
  return renderSection(
    "Subject Module",
    joinPromptSections([
      renderStableJsonSection("Subject Definition", {
        id: context.subjectModule.id,
        scope: context.subjectModule.scope ?? null,
        titleAr: context.subjectModule.titleAr,
      }),
    ]),
  );
}
