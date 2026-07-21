import type { SceneAnalysisState } from "../sceneAnalysisState.js";
import { freezeSceneAnalysisState } from "../sceneAnalysisState.js";
import { buildJudgeStateUpdates } from "./qualityJudgeEngine.js";

export function createQualityJudgeNode() {
  return (state: SceneAnalysisState): SceneAnalysisState => {
    const updates = buildJudgeStateUpdates(state);
    return freezeSceneAnalysisState({
      ...state,
      verifiedFindingCollection: updates.verifiedFindingCollection,
      qualityJudgment: updates.qualityJudgment,
      status: updates.status,
    });
  };
}
