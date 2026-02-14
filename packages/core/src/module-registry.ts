import { ModuleMetadata, RuntimeModule } from './types';

export class ModuleRegistry {
  private modules = new Map<string, ModuleMetadata>();

  register(module: RuntimeModule, routeIds: string[]): void {
    this.modules.set(module.name, {
      module,
      version: module.version,
      registeredRoutes: routeIds,
      loadedAt: new Date()
    });
  }

  unregister(name: string): ModuleMetadata | undefined {
    const metadata = this.modules.get(name);
    if (metadata) {
      this.modules.delete(name);
    }
    return metadata;
  }

  get(name: string): ModuleMetadata | undefined {
    return this.modules.get(name);
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  list(): ModuleMetadata[] {
    return Array.from(this.modules.values());
  }
}
