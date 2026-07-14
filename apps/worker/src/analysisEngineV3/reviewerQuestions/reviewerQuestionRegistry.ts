import { DEFAULT_REVIEWER_QUESTION_SET, DEFAULT_REVIEWER_QUESTION_SET_ID } from "./reviewerQuestionDefaults.js";
import type { ReviewerQuestionSet } from "./reviewerQuestionTypes.js";
import { validateReviewerQuestionSet } from "./reviewerQuestionValidator.js";

export class ReviewerQuestionRegistry {
  private readonly sets = new Map<string, ReviewerQuestionSet>();

  constructor(entries: readonly ReviewerQuestionSet[] = [DEFAULT_REVIEWER_QUESTION_SET]) {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  register(questionSet: ReviewerQuestionSet): this {
    const validation = validateReviewerQuestionSet(questionSet);
    if (!validation.valid) {
      const message = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
      throw new Error(`Invalid ReviewerQuestionSet: ${message}`);
    }
    this.sets.set(questionSet.id, questionSet);
    return this;
  }

  unregister(questionSetId: string): boolean {
    return this.sets.delete(questionSetId.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase());
  }

  load(questionSetId: string): ReviewerQuestionSet | null {
    return this.sets.get(questionSetId.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase()) ?? null;
  }

  list(): readonly ReviewerQuestionSet[] {
    return Object.freeze([...this.sets.values()].sort((left, right) => left.id.localeCompare(right.id)));
  }
}

export function createReviewerQuestionRegistry(entries?: readonly ReviewerQuestionSet[]): ReviewerQuestionRegistry {
  return new ReviewerQuestionRegistry(entries ?? [DEFAULT_REVIEWER_QUESTION_SET]);
}

export function createDefaultReviewerQuestionRegistry(): ReviewerQuestionRegistry {
  return new ReviewerQuestionRegistry([DEFAULT_REVIEWER_QUESTION_SET]);
}

export function getDefaultReviewerQuestionSet(): ReviewerQuestionSet {
  return DEFAULT_REVIEWER_QUESTION_SET;
}

export function getDefaultReviewerQuestionSetId(): string {
  return DEFAULT_REVIEWER_QUESTION_SET_ID;
}

