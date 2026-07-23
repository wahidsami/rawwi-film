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
import { createEmergencyContextualReviewerKnowledgeSelection } from "../reviewerKnowledge/emergencyContextualReviewerRouter.js";
import { compileReviewerContext } from "../reviewerCompiler/compiler.js";
import { logger } from "../../logger.js";
import { buildReviewerAcademyKnowledgePrompt } from "../../reviewerAcademy/articleKnowledgeRenderer.js";

type PromptRenderStepMetric = Readonly<{
  step: string;
  durationMs: number;
  characters?: number;
  tokens?: number;
  items?: number;
}>;

function estimatePromptTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function normalizeArticleId(value: string): string {
  const normalized = value.trim().toLowerCase();
  const numericMatch = normalized.match(/(\d+)/u);
  if (!numericMatch) {
    return normalized;
  }

  const parsed = Number.parseInt(numericMatch[1] ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return normalized;
  }

  return `article_${String(parsed).padStart(2, "0")}`;
}

function compareArticleIds(left: string, right: string): number {
  const leftMatch = left.match(/(\d+)/u);
  const rightMatch = right.match(/(\d+)/u);
  const leftNumber = leftMatch ? Number.parseInt(leftMatch[1] ?? "", 10) : Number.NaN;
  const rightNumber = rightMatch ? Number.parseInt(rightMatch[1] ?? "", 10) : Number.NaN;

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return left.localeCompare(right);
}

function collectSelectedArticleIds(
  input: V3PromptBuilderInput,
  compiledReviewerContext: NonNullable<V3PromptBuilderInput["compiledReviewerContext"]> | null,
): readonly string[] {
  const fromCompiledContext = compiledReviewerContext?.selectedArticles.map((article) => article.articleId) ?? [];
  const fromSubjectModule = (input.subjectModule.articleIds ?? []).map((articleId) => `article_${String(articleId).padStart(2, "0")}`);
  return [...new Set([...fromCompiledContext, ...fromSubjectModule].map(normalizeArticleId).filter((articleId) => articleId.length > 0))].sort(compareArticleIds);
}

function measurePromptRenderStep<T>(
  metrics: PromptRenderStepMetric[],
  step: string,
  fn: () => T,
  metadata?: Omit<PromptRenderStepMetric, "step" | "durationMs">,
): T {
  const startedAt = performance.now();
  const result = fn();
  metrics.push(Object.freeze({
    step,
    durationMs: Number((performance.now() - startedAt).toFixed(3)),
    ...(metadata ?? {}),
  }));
  return result;
}

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
  const profile: PromptRenderStepMetric[] = [];
  const conceptContext = measurePromptRenderStep(profile, "createPromptConceptContext", () => createPromptConceptContext(context), {
    items: context.glossary.entries.length,
  });
  const reviewerAssessment = measurePromptRenderStep(profile, "runReviewerMethodology", () => runReviewerMethodology({ promptInput: context, conceptContext }), {
    items: conceptContext.concepts.length,
  });
  const compiledReviewerContext = measurePromptRenderStep(profile, "resolveCompiledReviewerContext", () =>
    useReviewerCompiler
      ? (context.compiledReviewerContext ?? compileReviewerContext({
          promptInput: context,
          conceptContext,
          assessment: reviewerAssessment,
        }).compiledReviewerContext)
      : null,
  );
  const reviewerKnowledgeSelection = measurePromptRenderStep(profile, "selectReviewerKnowledge", () =>
    useReviewerCompiler
      ? null
      : createEmergencyContextualReviewerKnowledgeSelection({
          promptInput: context,
          conceptContext,
          assessment: reviewerAssessment,
        }),
  );
  const selectedArticleIds = measurePromptRenderStep(profile, "collectSelectedArticleIds", () =>
    collectSelectedArticleIds(context, compiledReviewerContext),
  );
  const academyKnowledgePrompt = measurePromptRenderStep(profile, "buildReviewerAcademyKnowledgePrompt", () =>
    buildReviewerAcademyKnowledgePrompt(selectedArticleIds),
  );

  const promptAssemblyStartedAt = performance.now();
  const prompt = joinPromptSections([
    "# Analysis Engine V3 System Prompt",
    renderSection(
      "Minimal Reviewer Framing",
      joinPromptSections([
        "You are the official reviewer responsible for the supplied GCAM article knowledge.",
        "Use the handbook below directly.",
        "Do not summarize, compile, synthesize, or rewrite the handbook.",
        "Keep output grounded in the supplied schema.",
      ]),
    ),
    academyKnowledgePrompt.section,
    renderReasoningStageAssembly(context.reasoningContract),
    renderDecisionGraphSection(context.decisionGraph),
    renderSemanticLayerSection(context.semanticLayer),
    renderStoryMemorySection(context),
    renderChunkContextSection(context),
    renderGlossarySection(context),
    renderSubjectModuleSection(context),
    renderOutputSchemaSection(context.outputSchema),
  ]);
  profile.push(Object.freeze({
    step: "assemblePromptSections",
    durationMs: Number((performance.now() - promptAssemblyStartedAt).toFixed(3)),
    characters: prompt.length,
    tokens: estimatePromptTokens(prompt),
    items: context.decisionGraph.nodes.length + (context.decisionGraph.edges?.length ?? 0),
  }));

  const promptTokens = estimatePromptTokens(prompt);
  logger.info("V3 instrumentation PROMPT RENDER PROFILE", {
    promptCharacterCount: prompt.length,
    promptTokenEstimate: promptTokens,
    useReviewerCompiler,
    evidenceCandidateCount: reviewerAssessment?.reasoningTrace?.length ?? 0,
    selectedReviewerCount: reviewerKnowledgeSelection?.routing.selectedReviewerIds.length ?? compiledReviewerContext?.selection.selectedReviewerIds.length ?? 0,
    selectedArticleCount: selectedArticleIds.length,
    selectedArticleIds: [...selectedArticleIds],
    selectedPolicyArticleIds: [...selectedArticleIds.map((articleId) => Number.parseInt(articleId.replace(/[^\d]/g, ""), 10)).filter((articleId) => Number.isFinite(articleId))],
    selectedAtomCount: compiledReviewerContext?.selectedAtoms.length ?? 0,
    selectedAtomIds: [...(compiledReviewerContext?.selectedAtoms.map((atom) => atom.atomId) ?? [])],
    selectedPolicyAtomIds: [...(compiledReviewerContext?.selectedPolicyAtomIds ?? compiledReviewerContext?.candidateDiagnostics?.atomRanking.selectedPolicyAtomIds ?? [])],
    academyMarkdownFiles: [...academyKnowledgePrompt.filePaths],
    academyMarkdownCharacterCount: academyKnowledgePrompt.characterCount,
    stepTimings: profile,
  });

  return prompt;
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
        knowledgeDomain: context.subjectModule.knowledgeDomain ?? null,
        reviewType: context.subjectModule.reviewType ?? null,
        primaryEvidence: context.subjectModule.primaryEvidence ?? null,
        titleAr: context.subjectModule.titleAr,
      }),
    ]),
  );
}
