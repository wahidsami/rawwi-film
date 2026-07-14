import type { KnowledgeLintPack, KnowledgeLintReport, KnowledgeLintRegistryEntry } from "./knowledgeLintTypes.js";
import { buildKnowledgeLintReport } from "./knowledgeLintValidator.js";

export class KnowledgeLintRunner {
  lintPack(pack: KnowledgeLintPack): KnowledgeLintReport {
    return buildKnowledgeLintReport(pack);
  }
}

export function createKnowledgeLintRunner(): KnowledgeLintRunner {
  return new KnowledgeLintRunner();
}

export function createKnowledgeLintRegistryEntry(pack: KnowledgeLintPack): KnowledgeLintRegistryEntry {
  const report = buildKnowledgeLintReport(pack);
  return Object.freeze({ pack, report });
}

