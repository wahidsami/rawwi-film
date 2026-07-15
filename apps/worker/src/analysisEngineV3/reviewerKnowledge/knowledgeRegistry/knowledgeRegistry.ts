import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadKnowledgeRegistryEntries, defaultKnowledgeRegistryRoot as loadDefaultKnowledgeRegistryRoot } from "./knowledgeRegistryLoader.js";
import { summarizeKnowledgeRegistryEntries } from "./knowledgeRegistryStatistics.js";
import { validateKnowledgeRegistryEntries } from "./knowledgeRegistryValidator.js";
import type { KnowledgeRegistryEntry, KnowledgeRegistryKind, KnowledgeRegistryReport } from "./knowledgeRegistryTypes.js";
import { hashKnowledgeRegistryValue, normalizeKnowledgeRegistryId } from "./knowledgeRegistryUtils.js";

function sortEntries(entries: readonly KnowledgeRegistryEntry[]): readonly KnowledgeRegistryEntry[] {
  return Object.freeze([...entries].sort((left, right) =>
    left.metadata.kind.localeCompare(right.metadata.kind) ||
    left.metadata.id.localeCompare(right.metadata.id) ||
    left.registryKey.localeCompare(right.registryKey),
  ));
}

function computeHash(entries: readonly KnowledgeRegistryEntry[], validationHash: string, statisticsHash: string): string {
  return hashKnowledgeRegistryValue({
    entries: entries.map((entry) => entry.registryKey),
    validationHash,
    statisticsHash,
  });
}

export class KnowledgeRegistry {
  private entriesState: readonly KnowledgeRegistryEntry[];
  private validationState = validateKnowledgeRegistryEntries([]);
  private statisticsState = summarizeKnowledgeRegistryEntries([], this.validationState);
  private hashState = computeHash([], this.validationState.hash, this.statisticsState.hash);

  constructor(rootDir: string = loadDefaultKnowledgeRegistryRoot(), entries: readonly KnowledgeRegistryEntry[] = loadKnowledgeRegistryEntries(rootDir)) {
    this.rootDir = rootDir;
    this.entriesState = sortEntries(entries);
    this.rebuild();
  }

  readonly rootDir: string;

  private rebuild(): void {
    this.validationState = validateKnowledgeRegistryEntries(this.entriesState);
    this.statisticsState = summarizeKnowledgeRegistryEntries(this.entriesState, this.validationState);
    this.hashState = computeHash(this.entriesState, this.validationState.hash, this.statisticsState.hash);
  }

  refresh(entries: readonly KnowledgeRegistryEntry[] = loadKnowledgeRegistryEntries(this.rootDir)): this {
    this.entriesState = sortEntries(entries);
    this.rebuild();
    return this;
  }

  get validation() {
    return this.validationState;
  }

  get statistics() {
    return this.statisticsState;
  }

  get hash() {
    return this.hashState;
  }

  get entriesList(): readonly KnowledgeRegistryEntry[] {
    return Object.freeze([...this.entriesState]);
  }

  get entries(): readonly KnowledgeRegistryEntry[] {
    return this.entriesList;
  }

  list(): readonly KnowledgeRegistryEntry[] {
    return this.entriesList;
  }

  listByKind(kind: KnowledgeRegistryKind): readonly KnowledgeRegistryEntry[] {
    return Object.freeze(this.entriesState.filter((entry) => entry.metadata.kind === kind));
  }

  get(registryKey: string): KnowledgeRegistryEntry | null {
    const normalized = normalizeKnowledgeRegistryId(registryKey);
    return this.entriesState.find((entry) => normalizeKnowledgeRegistryId(entry.registryKey) === normalized) ?? null;
  }

  register(entry: KnowledgeRegistryEntry): this {
    this.entriesState = sortEntries([...this.entriesState.filter((existing) => existing.registryKey !== entry.registryKey), entry]);
    this.rebuild();
    return this;
  }

  unregister(registryKey: string): boolean {
    const normalized = normalizeKnowledgeRegistryId(registryKey);
    const next = this.entriesState.filter((entry) => normalizeKnowledgeRegistryId(entry.registryKey) !== normalized);
    const deleted = next.length !== this.entriesState.length;
    if (deleted) {
      this.entriesState = sortEntries(next);
      this.rebuild();
    }
    return deleted;
  }
}

export function createKnowledgeRegistry(rootDir: string = loadDefaultKnowledgeRegistryRoot()): KnowledgeRegistry {
  return new KnowledgeRegistry(rootDir);
}

export function createKnowledgeRegistryFromEntries(entries: readonly KnowledgeRegistryEntry[], rootDir: string = loadDefaultKnowledgeRegistryRoot()): KnowledgeRegistry {
  return new KnowledgeRegistry(rootDir, entries);
}

export function loadKnowledgeRegistryFromDirectory(rootDir: string): KnowledgeRegistry {
  return new KnowledgeRegistry(rootDir);
}
