/**
 * Regression tests for the V4 InterpretSceneNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/interpretSceneNode.test.ts
 */
import { strict as assert } from "node:assert";

import { createSceneAnalysisState, type SceneAnalysisState } from "./sceneAnalysisState.js";
import { createInterpretSceneNode, buildInterpretScenePrompt, interpretScene } from "./interpretSceneNode.js";
import { createSceneUnderstandingNode } from "./sceneUnderstandingNode.js";

function testPromptUsesSceneModelOnly(): void {
  const understand = createSceneUnderstandingNode();
  const sceneModel = understand(createSceneAnalysisState({ sceneId: "scene-prompt", sceneText: "INT. HOUSE - NIGHT\nفهد: يا كلب" })).sceneModel!;
  const prompt = buildInterpretScenePrompt(sceneModel);

  assert.equal(prompt.systemPrompt.includes("screenplay semantic interpreter"), true);
  assert.equal(prompt.systemPrompt.includes("Do not classify policy violations"), true);
  assert.equal(prompt.systemPrompt.includes("Do not assign legal articles"), true);
  assert.equal(prompt.userPrompt.includes("يا كلب"), true);
  assert.equal(prompt.userPrompt.includes("scene-prompt"), true);
}

async function testIdenticalSceneModelsProduceEquivalentSemanticModels(): Promise<void> {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  type InterpreterSceneModel = NonNullable<SceneAnalysisState["sceneModel"]>;
  const deterministicInterpreter = async ({ sceneModel }: { sceneModel: InterpreterSceneModel }) => {
    const semanticSceneModel = {
      summary: sceneModel.summary,
      participants: [...sceneModel.characters],
      relationships: sceneModel.characters.length >= 2
        ? [{
            subject: sceneModel.characters[0] ?? "unknown",
            relation: "interacts_with",
            object: sceneModel.characters[1] ?? "unknown",
            evidence: sceneModel.sentences[0]?.text ?? null,
          }]
        : [],
      events: sceneModel.sentences.map((sentence, index) => ({
        eventType: index === 0 ? "Insult" : "Scene Observation",
        description: sentence.text,
        evidence: sentence.text,
        participants: [...sceneModel.characters],
      })) as readonly {
        eventType: string;
        description: string;
        evidence: string;
        participants: readonly string[];
      }[],
      timeline: sceneModel.sentences.map((sentence, index) => ({
        order: index + 1,
        description: sentence.text,
        evidence: sentence.text,
      })) as readonly {
        order: number;
        description: string;
        evidence: string;
      }[],
      speakerIntent: "hostile",
      emotionalState: "aggressive",
      victims: sceneModel.characters.length > 1 ? [sceneModel.characters[1] ?? sceneModel.characters[0] ?? "unknown"] : [],
      aggressors: sceneModel.characters.length > 0 ? [sceneModel.characters[0] ?? "unknown"] : [],
      targets: sceneModel.characters.length > 1 ? [sceneModel.characters[1] ?? "unknown"] : [],
      sensitiveConcepts: ["profanity"],
      scenePurpose: "confrontation",
      sceneOutcome: "escalation",
      confidence: 0.91,
    } as const;

    return {
      semanticSceneModel,
      semanticSceneResponse: JSON.stringify(semanticSceneModel),
    };
  };

  const node = createInterpretSceneNode({ interpretScene: deterministicInterpreter });
  const understand = createSceneUnderstandingNode();
  const firstScene = understand(createSceneAnalysisState({ sceneId: "scene-a", sceneText }));
  const secondScene = understand(createSceneAnalysisState({ sceneId: "scene-a", sceneText }));
  const first = await node(firstScene);
  const second = await node(secondScene);

  assert.deepEqual(first.semanticSceneModel, second.semanticSceneModel);
  assert.deepEqual(first.semanticSceneResponse, second.semanticSceneResponse);
  assert.equal(first.semanticSceneModel?.confidence, 0.91);
  assert.equal(first.semanticSceneModel?.participants.includes("فهد"), true);
  assert.equal(first.semanticSceneModel?.events[0]?.eventType, "Insult");
}

async function testDefaultInterpretSceneIsDeterministic(): Promise<void> {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const understand = createSceneUnderstandingNode();
  const sceneModel = understand(createSceneAnalysisState({ sceneId: "scene-default", sceneText })).sceneModel!;
  const interpretation = await interpretScene(sceneModel);

  assert.equal(interpretation.semanticSceneResponse, JSON.stringify(interpretation.semanticSceneModel));
  assert.equal(interpretation.semanticSceneModel.participants.includes("فهد"), true);
  assert.equal(interpretation.semanticSceneModel.events.length > 0, true);
  assert.equal(interpretation.semanticSceneModel.sensitiveConcepts.includes("profanity"), true);
}

async function main(): Promise<void> {
  testPromptUsesSceneModelOnly();
  await testIdenticalSceneModelsProduceEquivalentSemanticModels();
  await testDefaultInterpretSceneIsDeterministic();
  console.log("\nAll V4 InterpretSceneNode tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
