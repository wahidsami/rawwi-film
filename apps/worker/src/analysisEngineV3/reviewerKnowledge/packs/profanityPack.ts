import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { loadReviewerAcademyIndex } from "../academy/reviewerAcademyLoader.js";

const ACADEMY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "academy");

const PROFANITY_PACK = loadReviewerAcademyIndex(ACADEMY_ROOT).packs.find((pack) => pack.id === "v4_11_profanity");

if (!PROFANITY_PACK) {
  throw new Error("Academy pack not found: v4_11_profanity");
}

export const PROFANITY_REVIEWER_KNOWLEDGE_PACK: ReviewerKnowledgePack = PROFANITY_PACK;
