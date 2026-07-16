/**
 * Tests for the V3 Academy Manifest system.
 * Run: node --import tsx apps/worker/src/analysisEngineV3/reviewerKnowledge/academyManifest/academyManifest.test.ts
 */
import { strict as assert } from "node:assert";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAcademyManifest, renderAcademyManifest, validateAcademyManifest } from "./index.js";

function getReviewerKnowledgeRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function createTempRoot(): string {
  const tempBase = join(process.cwd(), ".tmp", "raawi-academy-manifest");
  mkdirSync(tempBase, { recursive: true });
  const tempRoot = mkdtempSync(join(tempBase, "run-"));
  cpSync(join(getReviewerKnowledgeRoot(), "academy"), join(tempRoot, "academy"), { recursive: true });
  cpSync(join(getReviewerKnowledgeRoot(), "lessons"), join(tempRoot, "lessons"), { recursive: true });
  return tempRoot;
}

function testManifestDiscovery(): void {
  const manifest = loadAcademyManifest(getReviewerKnowledgeRoot());
  const validation = validateAcademyManifest(manifest);

  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.academies.length, 14);
  assert.equal(manifest.lessons.length, 45);
  assert.equal(manifest.summary.missing_lesson_count, 0);
  assert.equal(manifest.summary.manifest_hash.length, 64);
  assert.equal(manifest.summary.unlocked_academy_count, 1);
  assert.equal(manifest.academies.find((academy) => academy.academy_id === "v3_00_universal")?.lesson_count, 43);
  assert.equal(manifest.academies.find((academy) => academy.academy_id === "v3_00_universal")?.completion_percent, 100);
  assert.equal(manifest.academies.find((academy) => academy.academy_id === "v3_00_universal")?.unlocked, true);
  assert.equal(manifest.academies.find((academy) => academy.academy_id === "v3_03_security")?.lesson_count, 0);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "lesson.0.academy_id"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "lesson.1.academy_id"), true);
  console.log("✓ manifest discovers current academies and lessons");
}

function testManifestRenderDeterminism(): void {
  const manifest = loadAcademyManifest(getReviewerKnowledgeRoot());
  const first = renderAcademyManifest(manifest);
  const second = renderAcademyManifest(manifest);

  assert.equal(first, second);
  assert.equal(first, renderAcademyManifest(loadAcademyManifest(getReviewerKnowledgeRoot())));
  console.log("✓ manifest rendering is deterministic");
}

function testManifestAutoDiscoversFutureLessons(): void {
  const tempRoot = createTempRoot();
  try {
    const futureLessonPath = join(tempRoot, "lessons", "universal", "lesson_015_future_reasoning.v1.json");
    const existingLessonPath = join(tempRoot, "lessons", "universal", "lesson_012_evidence_prioritization.v1.json");
    const existingLesson = JSON.parse(readFileSync(existingLessonPath, "utf8")) as Record<string, unknown>;

    const futureLesson = {
      ...existingLesson,
      id: "lesson_015_future_reasoning",
      lessonNumber: 15,
      title: "Future Reasoning",
      summary: "Synthetic future lesson for manifest discovery.",
      dependsOn: [
        "lesson_001_what_is_a_finding",
        "lesson_002_what_is_evidence",
        "lesson_003_understanding_context",
        "lesson_004_speaker_identification",
        "lesson_005_target_identification",
        "lesson_006_intent_recognition",
        "lesson_007_confidence_assessment",
        "lesson_008_narrative_structure",
        "lesson_009_concept_relationships",
        "lesson_010_exception_recognition",
        "lesson_011_multiple_findings",
        "lesson_012_evidence_prioritization",
        "lesson_013_contradiction_resolution",
      ],
      benchmarkReferences: ["future_reasoning_manifest"],
      metadata: {
        ...(existingLesson.metadata as Record<string, unknown>),
        priority: 15,
      },
    };

    writeFileSync(futureLessonPath, `${JSON.stringify(futureLesson, null, 2)}\n`, "utf8");

    const manifest = loadAcademyManifest(tempRoot);
    const validation = validateAcademyManifest(manifest);
    const universal = manifest.academies.find((academy) => academy.academy_id === "v3_00_universal");

    assert.equal(manifest.lessons.length, 46);
    assert.equal(universal?.lesson_count, 44);
    assert.equal(manifest.summary.missing_lesson_count, 0);
    assert.equal(validation.valid, false);
    assert.equal(validation.issues.some((issue) => issue.code === "lesson.0.academy_id"), true);
    console.log("✓ manifest automatically reflects a future lesson without manual updates");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function testValidationDetectsIntegrityFailures(): void {
  const manifest = loadAcademyManifest(getReviewerKnowledgeRoot());
  const tampered = JSON.parse(JSON.stringify(manifest)) as any;
  tampered.summary.manifest_hash = "bad";
  const validation = validateAcademyManifest(tampered);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "summary.manifest_hash"), true);
  console.log("✓ validation detects integrity failures");
}

async function main(): Promise<void> {
  testManifestDiscovery();
  testManifestRenderDeterminism();
  testManifestAutoDiscoversFutureLessons();
  testValidationDetectsIntegrityFailures();
  console.log("\nAll V3 academy manifest tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
