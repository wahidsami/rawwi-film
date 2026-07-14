export type LessonVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export type LessonConcept = Readonly<{
  id: string;
  title: string;
  summary: string;
  tags: readonly string[];
  target: string | null;
  articleIds: readonly number[];
}>;

export type LessonReviewerQuestion = Readonly<{
  id: string;
  purpose: string;
  expectedAnswerFormat: string;
  reasoningGuidance: string;
  evidenceRequirements: readonly string[];
}>;

export type LessonEvidenceRules = Readonly<{
  minimum: readonly string[];
  strong: readonly string[];
  weak: readonly string[];
  insufficient: readonly string[];
  confidenceGuidance: readonly string[];
}>;

export type LessonConceptRelationship = Readonly<{
  fromConceptId: string;
  toConceptId: string;
  relation: string;
  note: string | null;
}>;

export type LessonGlossaryReference = Readonly<{
  term: string;
  conceptId: string | null;
  relation: string;
  note: string | null;
}>;

export type LessonGCAMMapping = Readonly<{
  articleId: number;
  articleTitle: string;
  articleNumber: string;
  atomNumber: string | null;
  reportTitle: string;
  note: string | null;
}>;

export type LessonReportTemplate = Readonly<{
  findingTitle: string;
  reasonTemplate: string;
  recommendationTemplate: string;
  severity: "low" | "medium" | "high" | "critical";
  priority: number;
  reportCategory: string;
}>;

export type ReviewerKnowledgeLessonMetadata = Readonly<{
  subject?: string | null;
  category?: string | null;
  tags?: readonly string[];
  source?: string | null;
} & Record<string, unknown>>;

export type ReviewerKnowledgeLesson = Readonly<{
  id: string;
  title: string;
  version: LessonVersion;
  language: string;
  summary: string;
  learningObjectives: readonly string[];
  concepts: readonly LessonConcept[];
  reviewerQuestions: readonly LessonReviewerQuestion[];
  examples: readonly string[];
  counterExamples: readonly string[];
  exceptions: readonly string[];
  evidenceRules: LessonEvidenceRules;
  conceptRelationships: readonly LessonConceptRelationship[];
  glossaryReferences: readonly LessonGlossaryReference[];
  gcamMappings: readonly LessonGCAMMapping[];
  reportTemplates: readonly LessonReportTemplate[];
  benchmarkReferences: readonly string[];
  prerequisites: readonly string[];
  relatedLessons: readonly string[];
  metadata: ReviewerKnowledgeLessonMetadata;
}>;

export type ReviewerKnowledgeLessonDocument = Readonly<{
  schema_version: 1;
  lesson_version: LessonVersion;
  lesson: ReviewerKnowledgeLesson;
}>;

export type LessonPackBlueprint = Readonly<{
  id: string;
  module_id: string;
  title: string;
  default_question_set_id?: string | null;
  trigger_concept_ids: readonly string[];
  purpose: string;
  protected_interests: readonly string[];
  protected_concepts: readonly string[];
  summary?: string | null;
}>;

export type LessonSearchQuery = Readonly<{
  lessonId?: string | null;
  concept?: string | null;
  target?: string | null;
  gcamArticle?: number | null;
  keyword?: string | null;
  tag?: string | null;
  subject?: string | null;
}>;

export type LessonSearchResult = Readonly<{
  lesson: ReviewerKnowledgeLesson;
  score: number;
  reasons: readonly string[];
}>;

export type LessonDependencyNode = Readonly<{
  id: string;
  version: LessonVersion;
  dependencies: readonly string[];
  relatedLessons: readonly string[];
}>;

export type LessonDependencyEdge = Readonly<{
  from: string;
  to: string;
  relation: "prerequisite" | "related";
}>;

export type LessonDependencyIssue = Readonly<{
  code: string;
  path: string;
  message: string;
}>;

export type LessonDependencyGraph = Readonly<{
  nodes: readonly LessonDependencyNode[];
  edges: readonly LessonDependencyEdge[];
  cycles: ReadonlyArray<ReadonlyArray<string>>;
  missingReferences: readonly LessonDependencyIssue[];
  duplicateDependencies: readonly LessonDependencyIssue[];
  orphanLessons: readonly string[];
}>;

export type LessonValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type LessonValidationResult = Readonly<{
  valid: boolean;
  issues: readonly LessonValidationIssue[];
}>;

export type LessonStatistics = Readonly<{
  lessonCount: number;
  conceptCount: number;
  coverage: number;
  missingReferences: number;
  dependencyGraph: LessonDependencyGraph;
  validationScore: number;
  reuseCount: number;
  warningCount: number;
  errorCount: number;
}>;

export type LessonIndex = Readonly<{
  rootDir: string;
  lessons: readonly ReviewerKnowledgeLesson[];
  documents: readonly ReviewerKnowledgeLessonDocument[];
  manifest: readonly string[];
  statistics: LessonStatistics;
}>;
