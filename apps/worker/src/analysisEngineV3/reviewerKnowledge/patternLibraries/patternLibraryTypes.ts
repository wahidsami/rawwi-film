export type PatternLibraryVersion = Readonly<{
  major: number;
  minor: number;
  patch: number;
}>;

export type PatternLibraryConcept = Readonly<{
  id: string;
  title: string;
  description: string;
}>;

export type PatternLibraryGlossaryRelationship = Readonly<{
  id: string;
  from_concept_id: string;
  to_concept_id: string;
  relation: "parent" | "child" | "related" | "opposite" | "requires" | "supports";
  note?: string | null;
}>;

export type PatternLibraryGCAMMapping = Readonly<{
  id: string;
  article_id: number;
  atom_ids: readonly string[];
  role: string;
  note?: string | null;
}>;

export type PatternLibraryConfidenceModifier = Readonly<{
  id: string;
  title: string;
  description: string;
  confidence: number;
}>;

export type PatternLibraryExample = Readonly<{
  id: string;
  title: string;
  text: string;
  expected_outcome: string;
  note?: string | null;
}>;

export type PatternLibraryEntry = Readonly<{
  id: string;
  title: string;
  description: string;
  primary_concept_id: string;
  related_concept_ids: readonly string[];
  direct_expressions: readonly string[];
  indirect_expressions: readonly string[];
  semantic_intent: readonly string[];
  supporting_evidence: readonly string[];
  contradictory_evidence: readonly string[];
  false_positives: readonly string[];
  counter_examples: readonly string[];
  cross_sentence_indicators: readonly string[];
  scene_indicators: readonly string[];
  reviewer_guidance: readonly string[];
  confidence_modifiers: readonly PatternLibraryConfidenceModifier[];
  glossary_relationships: readonly PatternLibraryGlossaryRelationship[];
  gcam_mappings: readonly PatternLibraryGCAMMapping[];
  examples: readonly PatternLibraryExample[];
}>;

export type PatternLibraryMetadata = Readonly<{
  id: string;
  title: string;
  description: string;
  concepts: readonly PatternLibraryConcept[];
}>;

export type PatternLibraryDocument = Readonly<{
  schema_version: 1;
  version: PatternLibraryVersion;
  metadata: PatternLibraryMetadata;
  entries: readonly PatternLibraryEntry[];
}>;

export type PatternLibraryValidationIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}>;

export type PatternLibraryValidationResult = Readonly<{
  valid: boolean;
  issues: readonly PatternLibraryValidationIssue[];
  hash: string;
}>;

export type PatternLibraryRegistry = Readonly<{
  rootDir: string;
  documents: readonly PatternLibraryDocument[];
  validation: PatternLibraryValidationResult;
  hash: string;
  listDocuments: () => readonly PatternLibraryDocument[];
  listEntries: () => readonly PatternLibraryEntry[];
  getDocument: (id: string) => PatternLibraryDocument | null;
  getEntry: (id: string) => PatternLibraryEntry | null;
}>;
