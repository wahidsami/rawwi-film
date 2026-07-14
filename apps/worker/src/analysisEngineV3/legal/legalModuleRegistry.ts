import type { LegalModule } from "./legalModule.js";

export class LegalModuleRegistry {
  private readonly modules = new Map<string, LegalModule>();

  register(module: LegalModule): this {
    this.modules.set(module.id, module);
    return this;
  }

  unregister(moduleId: string): boolean {
    return this.modules.delete(moduleId);
  }

  load(moduleId: string): LegalModule | null {
    return this.modules.get(moduleId) ?? null;
  }

  list(): readonly LegalModule[] {
    return [...this.modules.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}

