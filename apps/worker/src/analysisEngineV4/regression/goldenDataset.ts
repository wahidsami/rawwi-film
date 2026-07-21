import { getPolicyArticle } from "../../policyMap.js";
import type { BenchmarkEvidence, BenchmarkFindingAction } from "../benchmark/benchmarkTypes.js";

export type RegressionScreenplayFinding = Readonly<{
  findingId: string;
  expectedEvidence: BenchmarkEvidence;
  expectedConceptId: string;
  expectedGcamArticleId: number;
  expectedExplanation: string;
  expectedAction: BenchmarkFindingAction;
}>;

export type RegressionScreenplay = Readonly<{
  screenplayId: string;
  sceneId: string;
  sceneText: string;
  expectedSceneSummary?: string | null;
  expectedScore: number;
  expectedFindings: readonly RegressionScreenplayFinding[];
}>;

const article4 = getPolicyArticle(4);
const sceneText = "حاضر. فهد يتمتم: يا كلب";
const expectedExplanation = `Grounded evidence "${sceneText}" expresses Profanity, so the Academy maps it to article 4 (${article4?.title_ar ?? "الألفاظ النابية"}).`;

const GOLDEN_REGRESSION_DATASET: readonly RegressionScreenplay[] = Object.freeze([
  Object.freeze({
    screenplayId: "screenplay-regression-1",
    sceneId: "scene-regression-1",
    sceneText,
    expectedSceneSummary: "Scene contains 1 line(s), 1 dialogue line(s), 0 action line(s), and 1 character hint(s).",
    expectedScore: 1,
    expectedFindings: Object.freeze([
      Object.freeze({
        findingId: "finding-1",
        expectedEvidence: Object.freeze({
          text: sceneText,
          startOffset: 0,
          endOffset: 23,
          lineId: "line-1",
          pageNumber: null,
        }),
        expectedConceptId: "profanity",
        expectedGcamArticleId: 4,
        expectedExplanation,
        expectedAction: "reject",
      }),
    ]),
  }),
]);

export function getGoldenRegressionDataset(): readonly RegressionScreenplay[] {
  return GOLDEN_REGRESSION_DATASET;
}

