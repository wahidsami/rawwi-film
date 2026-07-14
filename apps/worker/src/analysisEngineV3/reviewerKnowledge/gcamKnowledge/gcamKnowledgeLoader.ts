import type { GcamKnowledgeCatalog } from "./gcamKnowledgeTypes.js";
import { loadGcamKnowledgeCatalog } from "./gcamKnowledgeSource.js";

export class GcamKnowledgeLoader {
  load(): GcamKnowledgeCatalog {
    return loadGcamKnowledgeCatalog();
  }
}

export function createGcamKnowledgeLoader(): GcamKnowledgeLoader {
  return new GcamKnowledgeLoader();
}

