import type { ModuleMetadata, RouteDefinition, RuntimeModule } from './types';

export class ModuleRegistry<Request = unknown, Response = unknown> {
  private readonly modules = new Map<string, ModuleMetadata<Request, Response>>();

  register(
    module: RuntimeModule<Request, Response>,
    registeredRoutes: readonly RouteDefinition<Request, Response>[]
  ): ModuleMetadata<Request, Response> {
    const metadata: ModuleMetadata<Request, Response> = Object.freeze({
      module,
      registeredRoutes: Object.freeze([...registeredRoutes]),
      loadedAt: new Date()
    });

    this.modules.set(module.name, metadata);
    return metadata;
  }

  unregister(name: string): ModuleMetadata<Request, Response> | undefined {
    const metadata = this.modules.get(name);
    if (!metadata) {
      return undefined;
    }

    this.modules.delete(name);
    return metadata;
  }

  get(name: string): ModuleMetadata<Request, Response> | undefined {
    return this.modules.get(name);
  }

  has(name: string): boolean {
    return this.modules.has(name);
  }

  list(): readonly ModuleMetadata<Request, Response>[] {
    return Array.from(this.modules.values());
  }
}
