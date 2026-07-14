import type { ReviewerPackVersion } from "../academy/reviewerAcademyTypes.js";

export type AcademyManifestVersion = ReviewerPackVersion;

export type AcademyManifestLesson = Readonly<{
  lesson_id: string;
  lesson_version: AcademyManifestVersion;
  lesson_number: number | null;
  title: string;
  summary: string;
  category: string;
  academy_key: string;
  academy_id: string;
  depends_on: readonly string[];
  source_file: string;
  hash: string;
}>;

export type AcademyManifestAcademy = Readonly<{
  academy_id: string;
  academy_key: string;
  version: AcademyManifestVersion;
  title: string;
  description: string;
  supported_concepts: readonly string[];
  folder: string;
  file: string;
  has_pack: boolean;
  lesson_ids: readonly string[];
  lesson_count: number;
  missing_lesson_ids: readonly string[];
  missing_lesson_count: number;
  academy_dependencies: readonly string[];
  unlocked: boolean;
  completion_percent: number;
  hash: string;
}>;

export type AcademyManifestSummary = Readonly<{
  academy_count: number;
  lesson_count: number;
  missing_lesson_count: number;
  missing_lesson_ids: readonly string[];
  academy_dependency_count: number;
  unlocked_academy_count: number;
  unlocked_academy_ids: readonly string[];
  completion_percent: number;
  manifest_hash: string;
}>;

export type AcademyManifest = Readonly<{
  schema_version: 1;
  academy_version: AcademyManifestVersion;
  academies: readonly AcademyManifestAcademy[];
  lessons: readonly AcademyManifestLesson[];
  summary: AcademyManifestSummary;
}>;

export type AcademyManifestValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type AcademyManifestValidationResult = Readonly<{
  valid: boolean;
  issues: readonly AcademyManifestValidationIssue[];
}>;
