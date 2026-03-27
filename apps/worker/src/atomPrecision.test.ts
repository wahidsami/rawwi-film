import assert from "node:assert/strict";
import { refineAtomPrecision } from "./atomPrecision.js";
import type { JudgeFinding } from "./schemas.js";

function baseFinding(overrides: Partial<JudgeFinding>): JudgeFinding {
  return {
    article_id: 5,
    atom_id: "5-2",
    canonical_atom: "INSULT",
    severity: "medium",
    intensity: 2,
    context_impact: 2,
    legal_sensitivity: 2,
    audience_risk: 1,
    confidence: 0.9,
    title_ar: "مخالفة محتوى",
    description_ar: "",
    evidence_snippet: "",
    rationale_ar: "",
    is_interpretive: false,
    location: { start_offset: 0, end_offset: 10, start_line: 1, end_line: 1 },
    ...overrides,
  };
}

function run() {
  const victimBlaming = refineAtomPrecision(baseFinding({
    evidence_snippet: "هي السبب في اللي صار لها بعد التحرش",
    rationale_ar: "السطر يلوم الضحية ويبرر الإساءة إليها.",
    canonical_atom: "WOMEN",
  }));
  assert.equal(victimBlaming.article_id, 7);
  assert.equal(victimBlaming.atom_id, "7-4");

  const genderHumiliation = refineAtomPrecision(baseFinding({
    evidence_snippet: "مكان البنت المطبخ والسرير",
    rationale_ar: "فيه تحقير للمرأة بسبب جنسها.",
    canonical_atom: "WOMEN",
  }));
  assert.equal(genderHumiliation.article_id, 7);
  assert.equal(genderHumiliation.atom_id, "7-2");

  const violenceSolution = refineAtomPrecision(baseFinding({
    evidence_snippet: "الضرب هو الحل مع هؤلاء",
    rationale_ar: "يقدم العنف كحل مباشر للنزاع.",
    canonical_atom: "VIOLENCE",
    article_id: 5,
    atom_id: "5-1",
  }));
  assert.equal(violenceSolution.article_id, 9);
  assert.equal(violenceSolution.atom_id, "9-1");

  const dignityHarm = refineAtomPrecision(baseFinding({
    evidence_snippet: "أنت عديم الكرامة ولا قيمة لك",
    rationale_ar: "السياق يهين الكرامة الإنسانية مباشرة.",
    canonical_atom: "PRIVACY",
  }));
  assert.equal(dignityHarm.article_id, 17);
  assert.equal(dignityHarm.atom_id, "17-1");

  console.log("All atom precision tests passed.");
}

run();
