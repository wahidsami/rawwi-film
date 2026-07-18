/**
 * Determinism tests for the V3 prompt builder.
 * Run: npx tsx src/analysisEngineV3/builder/promptBuilder.test.ts
 */
import { buildV3Prompt, buildV3RenderedPrompt, renderV3PromptHash } from "./promptBuilder.js";
import type { V3PromptBuilderInput } from "./builderTypes.js";
import { getDefaultReviewerQuestionSet } from "../reviewerQuestions/index.js";
import { renderCompiledReviewerContextSection } from "../reviewerCompiler/compilerRenderer.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function makeBaseInput(): V3PromptBuilderInput {
  return {
    reasoningContract: {
      title: "Reasoning Contract",
      overview: "The shared V3 reasoning contract.",
      principles: [
        "Narrative before legality.",
        "Evidence before interpretation.",
        "Story Memory explains evidence.",
      ],
      stages: [
        {
          key: "narrative_understanding",
          title: "Narrative Understanding",
          purpose: "Understand the story before judging.",
          inputs: ["chunk", "story_memory", "neighboring_sentences"],
          outputs: ["narrative_model"],
        },
        {
          key: "evidence_identification",
          title: "Evidence Identification",
          purpose: "Locate candidate evidence inside the chunk.",
          inputs: ["chunk", "narrative_model"],
          outputs: ["candidate_evidence"],
        },
        {
          key: "context_evaluation",
          title: "Context Evaluation",
          purpose: "Use story memory and local context to refine meaning.",
          inputs: ["story_memory", "chunk", "candidate_evidence"],
          outputs: ["semantic_context"],
        },
      ],
    },
    decisionGraph: {
      title: "Decision Graph",
      overview: "Global decision flow for V3.",
      globalFlow: [
        "Does literal evidence exist?",
        "Is evidence admissible?",
        "Who is speaking?",
        "Is the statement literal?",
      ],
      nodes: [
        {
          id: "evidence",
          type: "evidence",
          title: "Evidence Node",
          purpose: "Detect literal evidence.",
          inputs: ["chunk"],
          outputs: ["candidate_evidence"],
          exitConditions: ["No evidence"],
        },
        {
          id: "legal",
          type: "legal",
          title: "Legal Node",
          purpose: "Apply subject rules.",
          inputs: ["candidate_evidence", "semantic_context"],
          outputs: ["legal_decision"],
        },
      ],
      edges: [
        { from: "evidence", to: "legal", label: "evidence is admissible", allowed: true },
      ],
      globalExitConditions: ["No evidence", "Exception applies"],
      evidencePriority: ["Literal Chunk", "Dialogue", "Narration"],
      contextPriority: ["Chunk", "Local Sentences", "Scene Memory"],
      example: "Does literal evidence exist? -> Is evidence admissible? -> Produce finding?",
    },
    semanticLayer: {
      title: "Semantic Interpretation Layer",
      purpose: "Transform literal evidence into semantic meaning before legal evaluation.",
      meaningQuestions: ["Who is speaking?", "Who is being addressed?", "Is the sentence quoted?"],
      narrativeIntentOptions: ["Approval", "Condemnation", "Neutrality", "Instruction"],
      conversationRoles: ["Speaker", "Listener", "Target", "Victim"],
      sceneRoles: ["Dialogue", "Narration", "Scene Description", "Documentary"],
      outputs: ["Semantic Meaning", "Narrative Intent", "Risk Context", "Confidence"],
      states: ["Literal", "Quoted", "Narrated", "Satire"],
      signals: ["Story Memory", "Scene Memory", "Neighboring dialogue"],
      examples: {
        good: ["A quoted warning in dialogue"],
        bad: ["A legal verdict inside the semantic layer"],
      },
      notes: ["The semantic layer must not decide legality."],
    },
    storyMemory: {
      summary: "The script follows a family conflict arc.",
      notes: ["Story Memory is context, not evidence."],
      scenes: ["Kitchen scene", "Street confrontation"],
    },
    chunkContext: {
      localChunk: "A: هل قلت ذلك؟\nB: نعم، لكن كان مزاحًا.",
      neighboringSentences: ["Before: They were arguing.", "After: Everyone laughed."],
      sceneMemory: "Interior, evening.",
      metadata: {
        chunkIndex: 3,
        scriptId: "script-001",
        versionId: "version-001",
      },
    },
    subjectModule: {
      id: "v3_01_religious",
      titleAr: "المساس بالثوابت الدينية",
      scope: "Faith-related evaluation.",
      rules: ["Evaluate direct religious harm."],
      exclusions: ["Do not classify neutral quotations."],
      requiredEvidence: ["Literal chunk evidence"],
      decisionTree: ["Is there literal evidence?", "Does the rule apply?"],
      examples: ["Mocking a sacred phrase"],
      nonExamples: ["Historical quotation without endorsement"],
      articleIds: [4, 16],
      notes: ["Subject prompts only define legal rules."],
    },
    glossary: {
      title: "Glossary Context",
      entries: [
        { term: "قذف", articleId: 4, variants: ["سب", "إهانة"], definition: "Direct insult terms." },
        { term: "إرهاب", articleId: 15, variants: ["ترويع"], definition: "Violent intimidation." },
      ],
      notes: ["Glossary is knowledge, not classification."],
    },
    outputSchema: {
      title: "Output Contract",
      fields: [
        { name: "narrative", description: "Narrative interpretation." },
        { name: "evidence", description: "Quoted evidence." },
        { name: "semantic", description: "Semantic interpretation." },
        { name: "context", description: "Scene context." },
        {
          name: "reasoned_decision",
          description: "Why, evidence, counterargument, applicable articles, rejected articles, and confidence.",
        },
      ],
      notes: ["Render the JSON contract exactly once."],
      example: {
        narrative: {},
        evidence: {},
        semantic: {},
        context: {},
        reasoned_decision: {
          why: "Explain the reviewer conclusion.",
          evidence: ["Support the decision with the chunk and precedent evidence."],
          counterargument: "Explain the strongest rejected interpretation.",
          applicable_articles: [11],
          rejected_articles: [4],
          confidence: 0.95,
        },
      },
    },
  };
}

function testIdenticalInputStable(): void {
  const inputA = makeBaseInput();
  const inputB = makeBaseInput();
  const renderedA = buildV3RenderedPrompt(inputA);
  const renderedB = buildV3RenderedPrompt(inputB);

  assert(renderedA.prompt === renderedB.prompt, "identical input should render identical prompt");
  assert(renderedA.promptHash === renderedB.promptHash, "identical input should render identical prompt hash");
  assert(renderV3PromptHash(renderedA.prompt) === renderedA.promptHash, "hash helper should match rendered hash");
  assert(buildV3Prompt(inputA) === renderedA.prompt, "buildV3Prompt should match rendered output");
  console.log("✓ identical input renders identical prompt and hash");
}

function testReviewerKnowledgePackRendered(): void {
  const rendered = buildV3RenderedPrompt(makeBaseInput());

  assert(rendered.prompt.indexOf("## Reviewer Methodology") < rendered.prompt.indexOf("## Reviewer Knowledge Packs"), "methodology should render before packs");
  assert(rendered.prompt.indexOf("## Reviewer Questions") < rendered.prompt.indexOf("## Reviewer Knowledge Packs"), "questions should render before packs");
  assert(rendered.prompt.indexOf("## Reviewer Methodology") < rendered.prompt.indexOf("## Reviewer Questions"), "methodology should render before questions");
  assert(rendered.prompt.includes("Reviewer Knowledge Packs"), "reviewer knowledge section should be rendered");
  assert(rendered.prompt.includes("GPT Reviewer Assistant"), "GPT reviewer assistant should be rendered");
  assert(rendered.prompt.includes("Reviewer Reasoning Engine"), "reviewer reasoning engine should be rendered");
  assert(rendered.prompt.includes("knowledge_retrieval"), "dynamic knowledge retrieval should be rendered");
  assert(rendered.prompt.includes("reasoning_pipeline"), "reviewer reasoning pipeline should be rendered");
  assert(rendered.prompt.includes("Default Reviewer Question Set"), "default reviewer question set should render");
  assert(rendered.prompt.includes(getDefaultReviewerQuestionSet().id), "default reviewer question set id should render");
  assert(rendered.prompt.includes("Profanity Reviewer Knowledge Pack"), "profanity pack should be selected for profanity input");
  assert(rendered.prompt.includes("reasoned_decision"), "output schema should request a reasoned decision");
  assert(rendered.prompt.includes("recommendation"), "output schema should request a recommendation");
  assert(rendered.prompt.includes("contradicting_evidence"), "prompt should request contradicting evidence using the parser's canonical field");
  assert(rendered.prompt.includes("evidence_candidates"), "prompt should render sentence-level evidence candidates");
  assert(rendered.prompt.includes("policy engine"), "prompt should hand exception handling to the policy engine");
  assert(rendered.prompt.includes("Do not suppress a detection"), "prompt should not suppress detections because of exceptions");
  assert(rendered.prompt.includes("article-by-article"), "prompt should instruct article-by-article evaluation");
  assert(rendered.prompt.includes("PASS or FAIL"), "prompt should instruct PASS or FAIL per article");
  assert(rendered.prompt.includes("find all policy violations"), "prompt should instruct exhaustive violation hunting");
  assert(rendered.prompt.includes("Do not stop after finding one exception"), "prompt should forbid stopping after a single exception");
  assert(rendered.prompt.includes("Analyze every threatening, abusive, violent, sexual, political, religious, criminal, or profane statement independently"), "prompt should require per-statement analysis");
  assert(rendered.prompt.includes("independent violation evidence unit"), "prompt should treat evidence units as the atomic unit of work");
  assert(rendered.prompt.includes("article ids may repeat"), "prompt should allow repeated article ids for separate evidence units");
  assert(rendered.prompt.includes("facts, actors, objects, injuries, or events"), "prompt should prohibit unsupported facts");
  assert(!rendered.prompt.includes('"rules": ['), "subject rule bundles should no longer be rendered directly");
  console.log("✓ reviewer knowledge packs are rendered instead of subject rule bundles");
}

function testDeterministicCandidateContractUsesPolicyArticleIds(): void {
  const input: V3PromptBuilderInput = {
    ...makeBaseInput(),
    compiledReviewerContext: {
      academyRoot: "academy",
      fingerprint: "fingerprint",
      generatedAt: "2026-07-18T00:00:00.000Z",
      selection: {
        selectedReviewerIds: ["v3_01_religious"],
        selectedReviewerLabels: ["Religion Reviewer"],
        selectedAcademyFolders: ["religion"],
        rejectedReviewerIds: [],
        rejectedReviewerLabels: [],
        loadedAcademyCount: 1,
        skippedAcademyCount: 0,
        knowledgeReductionPercent: 0,
        routingConfidence: 0.99,
        routingReason: "Candidate aware route.",
        lowConfidence: false,
        reviewerScores: [],
      },
      universalManuals: [],
      selectedReviewerManuals: [],
      rejectedReviewerManuals: [],
      selectedReviewerPackages: [],
      selectedArticles: [
        {
          articleId: "article_11",
          reviewer: "Religion",
          title: "Article 11",
          protectedInterest: "",
          purpose: "",
          neighboringArticles: [],
          atoms: ["atom_11_1"],
          inherits: [],
          priority: null,
          runtime: null,
          retrieval: null,
          status: null,
          sourcePath: "articles/article_11.md",
        },
      ],
      selectedAtoms: [],
      selectedPolicyArticleIds: [11],
      selectedPolicyAtomIds: [],
      loadedManualCount: 0,
      loadedReviewerCount: 1,
      loadedArticleCount: 1,
      loadedAtomCount: 0,
      loadedCharacterCount: 0,
      estimatedTokenCount: 1,
      promptCharacterCount: 0,
      promptTokenEstimate: 1,
      promptPreview: "",
      candidateDiagnostics: {
        enabled: true,
      routing: {
        selectedReviewerIds: ["v3_01_religious"],
        selectedReviewerLabels: ["Religion Reviewer"],
        selectedReviewerPackIds: ["v3_01_religious"],
        selectedAcademyFolders: ["religion"],
        rejectedReviewerIds: [],
        rejectedReviewerLabels: [],
          loadedAcademyCount: 1,
          skippedAcademyCount: 0,
          knowledgeReductionPercent: 0,
          routingConfidence: 0.99,
          routingReason: "Candidate aware route.",
          lowConfidence: false,
          reviewerScores: [],
        },
        resolvedReviewerFolders: ["religion"],
        selectedReviewerIds: ["v3_01_religious"],
        selectedReviewerLabels: ["Religion Reviewer"],
        rejectedReviewerIds: [],
        rejectedReviewerLabels: [],
        reviewerScores: [],
        articleRanking: {
          enabled: true,
          selectedReviewerIds: ["v3_01_religious"],
          selectedReviewerFolders: ["religion"],
          queryTerms: ["candidate"],
          articleScores: [],
          selectedArticleIdsByReviewer: { v3_01_religious: ["article_11"] },
          selectedPolicyArticleIdsByReviewer: { v3_01_religious: [11] },
          selectedArticleIds: ["article_11"],
          selectedPolicyArticleIds: [11],
          selectedArticleCount: 1,
          rejectedArticleCount: 0,
          articleReductionPercent: 0,
          limitPerReviewer: 2,
        },
        atomRanking: {
          enabled: true,
          selectedReviewerIds: ["v3_01_religious"],
          selectedReviewerFolders: ["religion"],
          queryTerms: ["candidate"],
          atomScores: [],
          selectedAtomIdsByArticle: { article_11: [] },
          selectedPolicyAtomIdsByArticle: { article_11: [] },
          selectedAtomIds: [],
          selectedPolicyAtomIds: [],
          selectedAtomCount: 0,
          rejectedAtomCount: 0,
          atomReductionPercent: 0,
          limitPerArticle: 3,
        },
        legacyArticleCount: 1,
        legacyAtomCount: 0,
        selectedArticleCount: 1,
        selectedAtomCount: 0,
        articleReductionPercent: 0,
        atomReductionPercent: 0,
        legacyPromptCharacterCount: 1,
        candidatePromptCharacterCount: 1,
        promptReductionPercent: 0,
        finalAcceptedCandidate: {
          articleId: "article_11",
          policyArticleId: 11,
          atomId: null,
          policyAtomId: null,
          reviewer: "Religion",
          title: "Article 11",
        },
      },
    },
  } as V3PromptBuilderInput;

  const rendered = renderCompiledReviewerContextSection(input.compiledReviewerContext as NonNullable<V3PromptBuilderInput["compiledReviewerContext"]>);
  assert(rendered.includes('"selected_policy_article_ids"'), "compiled reviewer context should render canonical policy article ids");
  assert(rendered.includes("11"), "compiled reviewer context should include the canonical article id value");
  console.log("✓ deterministic candidate contract renders policy article ids");
}

function testStoryMemoryChangesHash(): void {
  const base = makeBaseInput();
  const changed: V3PromptBuilderInput = {
    ...makeBaseInput(),
    storyMemory: (() => {
      const storyMemory = makeBaseInput().storyMemory;
      if (typeof storyMemory === "string") {
        return `${storyMemory} Updated.`;
      }
      return {
        ...storyMemory,
        summary: `${storyMemory.summary ?? ""} Updated.`,
      };
    })(),
  };

  const baseRendered = buildV3RenderedPrompt(base);
  const changedRendered = buildV3RenderedPrompt(changed);

  assert(baseRendered.prompt !== changedRendered.prompt, "changing Story Memory should change the rendered prompt");
  assert(baseRendered.promptHash !== changedRendered.promptHash, "changing Story Memory should change the hash");
  console.log("✓ Story Memory changes alter the prompt hash");
}

function testSubjectModuleChangesHash(): void {
  const base = makeBaseInput();
  const changed: V3PromptBuilderInput = {
    ...makeBaseInput(),
    subjectModule: {
      ...makeBaseInput().subjectModule,
      titleAr: `${makeBaseInput().subjectModule.titleAr} (updated)`,
    },
  };

  const baseRendered = buildV3RenderedPrompt(base);
  const changedRendered = buildV3RenderedPrompt(changed);

  assert(baseRendered.promptHash !== changedRendered.promptHash, "changing Subject Module should change the hash");
  console.log("✓ Subject Module changes alter the prompt hash");
}

function testGlossaryChangesHash(): void {
  const base = makeBaseInput();
  const changed: V3PromptBuilderInput = {
    ...makeBaseInput(),
    glossary: {
      ...makeBaseInput().glossary,
      entries: [
        ...makeBaseInput().glossary.entries,
        { term: "تحريض", articleId: 12, variants: ["دعوة"], definition: "Incitement terms." },
      ],
    },
  };

  const baseRendered = buildV3RenderedPrompt(base);
  const changedRendered = buildV3RenderedPrompt(changed);

  assert(baseRendered.promptHash !== changedRendered.promptHash, "changing Glossary should change the hash");
  console.log("✓ Glossary changes alter the prompt hash");
}

async function main(): Promise<void> {
  testIdenticalInputStable();
  testReviewerKnowledgePackRendered();
  testDeterministicCandidateContractUsesPolicyArticleIds();
  testStoryMemoryChangesHash();
  testSubjectModuleChangesHash();
  testGlossaryChangesHash();
  console.log("\nAll V3 prompt builder tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
