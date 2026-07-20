/**
 * Regression tests for the V4 SceneUnderstandingNode.
 * Run: node --import tsx apps/worker/src/analysisEngineV4/sceneUnderstandingNode.test.ts
 */
import { strict as assert } from "node:assert";

import { createSceneAnalysisState, createSceneUnderstandingNode, buildSceneUnderstandingPrompt, understandScene } from "./index.js";

function testPromptSpeaksAsScreenplayReader(): void {
  const prompt = buildSceneUnderstandingPrompt("INT. HOUSE - NIGHT\nفهد: يا كلب");
  assert.equal(prompt.systemPrompt.includes("screenplay reader"), true);
  assert.equal(prompt.systemPrompt.includes("not a reviewer"), true);
  assert.equal(prompt.systemPrompt.includes("Do not classify violations"), true);
  assert.equal(prompt.systemPrompt.includes("Do not assign articles"), true);
  assert.equal(prompt.systemPrompt.includes("Do not produce findings"), true);
  assert.equal(prompt.userPrompt, "INT. HOUSE - NIGHT\nفهد: يا كلب");
}

function testIdenticalScenesProduceEquivalentSceneModels(): void {
  const sceneText = "INT. HOUSE - NIGHT\nفهد: يا كلب\nالجارة تغلق الباب.";
  const node = createSceneUnderstandingNode();
  const first = node(createSceneAnalysisState({ sceneId: "scene-a", sceneText }));
  const second = node(createSceneAnalysisState({ sceneId: "scene-a", sceneText }));

  assert.deepEqual(first.sceneModel, second.sceneModel);
  assert.equal(first.sceneModel?.rawSceneText, sceneText);
  assert.equal(first.sceneModel?.summary, second.sceneModel?.summary);
  assert.equal(first.sceneModel?.dialogueLines.length, 1);
  assert.equal(first.sceneModel?.actionLines.length > 0, true);
  assert.equal(first.normalizedSceneText, second.normalizedSceneText);
  assert.equal(first.sentences.length, second.sentences.length);
  assert.equal(first.sceneModel?.characters[0], "فهد");
  assert.equal(first.sentences[0]?.text, "فهد: يا كلب");
  assert.equal(first.sentences[0]?.sourceType, "dialogue");
}

function testUnderstandSceneHelperIsDeterministic(): void {
  const sceneText = "خارجي - شارع - ليل\nعمر: اخرجوا من هنا";
  const left = understandScene("scene-c", sceneText);
  const right = understandScene("scene-c", sceneText);

  assert.deepEqual(left, right);
  assert.equal(left.heading.sceneType, "exterior");
  assert.equal(left.characters.includes("عمر"), true);
}

function main(): void {
  testPromptSpeaksAsScreenplayReader();
  testIdenticalScenesProduceEquivalentSceneModels();
  testUnderstandSceneHelperIsDeterministic();
  console.log("\nAll V4 SceneUnderstandingNode tests passed.");
}

main();
