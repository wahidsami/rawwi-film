import type { LegalModule } from "./legalModule.js";
import { LegalModuleRegistry } from "./legalModuleRegistry.js";

export class LegalModuleLoader {
  constructor(private readonly registry: LegalModuleRegistry) {}

  load(moduleId: string): LegalModule | null {
    return this.registry.load(moduleId);
  }

  loadRequired(moduleId: string): LegalModule {
    const module = this.load(moduleId);
    if (!module) {
      throw new Error(`Legal module not found: ${moduleId}`);
    }
    return module;
  }
}

export function createLegalModuleLoader(registry: LegalModuleRegistry): LegalModuleLoader {
  return new LegalModuleLoader(registry);
}

