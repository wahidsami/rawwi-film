export type ReviewerKnowledgeArticleMapping = Readonly<{
  article_id: number;
  atom_ids: readonly string[];
  role: string;
  note: string | null;
}>;

export type ReviewerKnowledgeGlossaryRelationship = Readonly<{
  term: string;
  concept_id: string | null;
  relation: string;
  note: string | null;
}>;

export type ReviewerKnowledgePack = Readonly<{
  id: string;
  module_id: string;
  title: string;
  default_question_set_id?: string | null;
  trigger_concept_ids: readonly string[];
  purpose: string;
  protected_interests: readonly string[];
  protected_concepts: readonly string[];
  required_evidence: readonly string[];
  insufficient_evidence: readonly string[];
  reviewer_heuristics: readonly string[];
  legal_exceptions: readonly string[];
  positive_examples: readonly string[];
  negative_examples: readonly string[];
  common_false_positives: readonly string[];
  glossary_relationships: readonly ReviewerKnowledgeGlossaryRelationship[];
  article_mapping: readonly ReviewerKnowledgeArticleMapping[];
  reporting_guidance: readonly string[];
}>;
