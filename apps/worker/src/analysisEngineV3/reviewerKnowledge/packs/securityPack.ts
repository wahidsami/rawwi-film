import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReviewerKnowledgePack } from "../reviewerKnowledgeTypes.js";
import { loadReviewerAcademyIndex } from "../academy/reviewerAcademyLoader.js";

const ACADEMY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "academy");

const SECURITY_PACK = loadReviewerAcademyIndex(ACADEMY_ROOT).packs.find((pack) => pack.id === "v3_03_security");

if (!SECURITY_PACK) {
  throw new Error("Academy pack not found: v3_03_security");
}

export const SECURITY_REVIEWER_KNOWLEDGE_PACK: ReviewerKnowledgePack = SECURITY_PACK;
