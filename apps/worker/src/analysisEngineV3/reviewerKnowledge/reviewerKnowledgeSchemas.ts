import { z } from "zod";
import type { ReviewerKnowledgePack } from "./reviewerKnowledgeTypes.js";

const NonEmptyTrimmedString = z.string().refine((value) => value.normalize("NFC").trim().length > 0, {
  message: "must be a non-empty string",
});

const OptionalTrimmedString = z.union([z.null(), NonEmptyTrimmedString]);

const StringList = z.array(NonEmptyTrimmedString);

const ArticleMappingSchema = z.object({
  article_id: z.number().int().positive(),
  atom_ids: z.array(NonEmptyTrimmedString),
  role: NonEmptyTrimmedString,
  note: OptionalTrimmedString,
});

const GlossaryRelationshipSchema = z.object({
  term: NonEmptyTrimmedString,
  concept_id: OptionalTrimmedString,
  relation: NonEmptyTrimmedString,
  note: OptionalTrimmedString,
});

export const ReviewerKnowledgePackSchema: z.ZodType<ReviewerKnowledgePack> = z.object({
  id: NonEmptyTrimmedString,
  module_id: NonEmptyTrimmedString,
  title: NonEmptyTrimmedString,
  default_question_set_id: z.union([z.null(), NonEmptyTrimmedString]).optional(),
  trigger_concept_ids: StringList,
  purpose: NonEmptyTrimmedString,
  protected_interests: StringList,
  protected_concepts: StringList,
  required_evidence: StringList,
  insufficient_evidence: StringList,
  reviewer_heuristics: StringList,
  legal_exceptions: StringList,
  positive_examples: StringList,
  negative_examples: StringList,
  common_false_positives: StringList,
  glossary_relationships: z.array(GlossaryRelationshipSchema),
  article_mapping: z.array(ArticleMappingSchema),
  reporting_guidance: StringList,
}).strict();

export const ReviewerKnowledgePackDocumentSchema = z.object({
  schema_version: z.literal(1),
  pack_version: NonEmptyTrimmedString,
  pack: ReviewerKnowledgePackSchema,
  format: z.literal("reviewer_knowledge_pack").optional(),
}).strict();

export const ReviewerKnowledgePackBundleSchema = z.object({
  schema_version: z.literal(1),
  bundle_version: NonEmptyTrimmedString,
  packs: z.array(ReviewerKnowledgePackDocumentSchema).min(1),
  format: z.literal("reviewer_knowledge_bundle").optional(),
}).strict();

export type ReviewerKnowledgePackDocument = z.infer<typeof ReviewerKnowledgePackDocumentSchema>;
export type ReviewerKnowledgePackBundle = z.infer<typeof ReviewerKnowledgePackBundleSchema>;
export type ReviewerKnowledgePackDocumentInput = ReviewerKnowledgePack | ReviewerKnowledgePackDocument | ReviewerKnowledgePackBundle;
