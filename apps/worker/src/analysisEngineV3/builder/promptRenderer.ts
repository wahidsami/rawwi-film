import { createHash } from "node:crypto";
import { normalizePromptBuilderInput } from "./builderContext.js";
import { renderChunkContextSection, renderStoryMemorySection } from "./contextAssembler.js";
import { renderOutputSchemaSection } from "./outputAssembler.js";
import { renderReasoningStageAssembly } from "./stageAssembler.js";
import { renderSemanticLayerSection } from "./semanticAssembler.js";
import { joinPromptSections, renderListSection, renderRawSection, renderSection, renderStableJsonSection, renderStructuredSection } from "./sectionAssembler.js";
import type { V3PromptBuilderInput, V3RenderedPrompt } from "./builderTypes.js";
import { config } from "../../config.js";
import { createPromptConceptContext, runReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRunner.js";
import { getDefaultReviewerMethodology } from "../reviewerMethodology/reviewerMethodologyRegistry.js";
import { renderReviewerMethodologySection } from "../reviewerMethodology/reviewerMethodologyRenderer.js";
import { getDefaultReviewerQuestionSet, renderReviewerQuestionSetSection } from "../reviewerQuestions/index.js";
import { createReviewerKnowledgeRetrievalReport } from "../reviewerKnowledge/reviewerKnowledgeRetrieval.js";
import { renderReviewerKnowledgePacksSection } from "../reviewerKnowledge/reviewerKnowledgeRenderer.js";
import { createEmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { buildReviewerReasoningEnginePayload } from "./reviewerReasoningEngine.js";
import { compileReviewerContext } from "../reviewerCompiler/compiler.js";
import { renderCompiledReviewerContextSection } from "../reviewerCompiler/compilerRenderer.js";

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
  const useReviewerCompiler = config.REVIEWER_COMPILER_ENABLED || config.DETERMINISTIC_CANDIDATES_ENABLED;
  const conceptContext = createPromptConceptContext(context);
  const reviewerAssessment = runReviewerMethodology({ promptInput: context, conceptContext });
  const reviewerQuestionSet = getDefaultReviewerQuestionSet();
  const compiledReviewerContext = useReviewerCompiler
    ? (context.compiledReviewerContext ?? compileReviewerContext({
        promptInput: context,
        conceptContext,
        assessment: reviewerAssessment,
      }).compiledReviewerContext)
    : null;
  const reviewerKnowledgeSelection = useReviewerCompiler
    ? null
    : createEmergencyContextualReviewerKnowledgeSelection({
        promptInput: context,
        conceptContext,
        assessment: reviewerAssessment,
      });
  const knowledgeRetrieval = useReviewerCompiler
    ? null
    : createReviewerKnowledgeRetrievalReport({
        assessment: reviewerAssessment,
        conceptContext,
        subjectModule: context.subjectModule,
        registry: reviewerKnowledgeSelection!.reviewerKnowledgeRegistry,
        topK: Math.max(1, reviewerKnowledgeSelection!.routing.selectedReviewerPackIds.length),
      });
  const reviewerKnowledgePacks = knowledgeRetrieval?.selectedPacks ?? [];
  const reviewerReasoningEngine = useReviewerCompiler
    ? null
    : buildReviewerReasoningEnginePayload(
        context,
        conceptContext,
        reviewerAssessment,
        reviewerKnowledgePacks,
        reviewerKnowledgeSelection!.knowledgeRegistry,
        knowledgeRetrieval!,
      );
  const reviewerMethodology = getDefaultReviewerMethodology();

  return joinPromptSections([
    "# Analysis Engine V3 System Prompt",
    renderReviewerMethodologySection(reviewerMethodology, reviewerAssessment),
    renderReviewerQuestionSetSection(reviewerQuestionSet),
    useReviewerCompiler && compiledReviewerContext
      ? renderCompiledReviewerContextSection(compiledReviewerContext)
      : renderReviewerKnowledgePacksSection(reviewerKnowledgePacks),
    useReviewerCompiler && compiledReviewerContext
      ? renderStableJsonSection("Compiled Reviewer Context Summary", {
          selected_reviewer_ids: [...compiledReviewerContext.selection.selectedReviewerIds],
          selected_reviewer_labels: [...compiledReviewerContext.selection.selectedReviewerLabels],
          loaded_manual_count: compiledReviewerContext.loadedManualCount,
          estimated_token_count: compiledReviewerContext.estimatedTokenCount,
          prompt_character_count: compiledReviewerContext.promptCharacterCount,
          prompt_token_estimate: compiledReviewerContext.promptTokenEstimate,
        })
      : renderStableJsonSection("GPT Reviewer Assistant", reviewerReasoningEngine!.gpt_reviewer_assistant ?? {}),
    useReviewerCompiler && compiledReviewerContext
      ? null
      : renderStableJsonSection("Reviewer Reasoning Engine", reviewerReasoningEngine!),
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
