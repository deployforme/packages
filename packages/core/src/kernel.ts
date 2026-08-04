import * as path from 'node:path';
import { resolveKernelConfig, type KernelConfig, type ResolvedKernelConfig } from './config';
import { ModuleLoader } from './loader';
import { ModuleRegistry } from './module-registry';
import { Dashboard } from './monitoring/dashboard';
import { Monitor } from './monitoring/monitor';
import type { DashboardAddress, MonitoringSnapshot } from './monitoring/types';
import type {
  HttpAdapter,
  HttpMethod,
  ModuleMetadata,
  RouteDefinition,
  RuntimeContext,
  RuntimeModule
} from './types';

const HTTP_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

export class Kernel<Request = unknown, Response = unknown> {
  private readonly registry = new ModuleRegistry<Request, Response>();
  private readonly loader = new ModuleLoader();
  private readonly monitor: Monitor;
  private readonly config: ResolvedKernelConfig;
  private pendingOperation: Promise<void> = Promise.resolve();
  private dashboard?: Dashboard;
  private dashboardAddress?: DashboardAddress;
  private dashboardStart?: Promise<DashboardAddress>;

  constructor(
    private readonly context: RuntimeContext<Request, Response>,
    config: KernelConfig = {}
  ) {
    this.config = resolveKernelConfig(config);
    this.monitor = new Monitor(this.config.buildHistoryLimit);
  }

  async start(): Promise<DashboardAddress | undefined> {
    if (!this.config.dashboard.enabled) {
      return undefined;
    }
    if (this.dashboardAddress) {
      return this.dashboardAddress;
    }
    if (this.dashboardStart) {
      return this.dashboardStart;
    }

    this.dashboard = new Dashboard(this.monitor, this.config.dashboard);
    this.dashboardStart = this.dashboard.start();

    try {
      this.dashboardAddress = await this.dashboardStart;
      this.context.logger?.log(`Dashboard ready at ${this.dashboardAddress.url}`);
      return this.dashboardAddress;
    } catch (error) {
      this.dashboard = undefined;
      throw error;
    } finally {
      this.dashboardStart = undefined;
    }
  }

  load(modulePath: string): Promise<ModuleMetadata<Request, Response>> {
    return this.runExclusive(() => this.loadInternal(modulePath));
  }

  reload(modulePath: string): Promise<ModuleMetadata<Request, Response>> {
    return this.load(modulePath);
  }

  unload(moduleName: string): Promise<boolean> {
    return this.runExclusive(() => this.unloadInternal(moduleName));
  }

  stop(): Promise<void> {
    return this.runExclusive(async () => {
      const errors: unknown[] = [];

      for (const metadata of this.registry.list()) {
        try {
          await this.unloadInternal(metadata.module.name);
        } catch (error) {
          errors.push(error);
        }
      }

      try {
        await this.stopDashboard();
      } catch (error) {
        errors.push(error);
      }

      if (errors.length > 0) {
        throw new AggregateError(errors, 'Hivelet failed to stop cleanly');
      }
    });
  }

  list(): readonly ModuleMetadata<Request, Response>[] {
    return this.registry.list();
  }

  get(moduleName: string): ModuleMetadata<Request, Response> | undefined {
    return this.registry.get(moduleName);
  }

  status(): MonitoringSnapshot {
    return this.monitor.snapshot();
  }

  private async loadInternal(modulePath: string): Promise<ModuleMetadata<Request, Response>> {
    const buildId = this.monitor.startBuild(path.basename(modulePath), modulePath);

    try {
      const module = await this.loader.load<Request, Response>(modulePath);
      this.monitor.identifyBuild(buildId, module.name);
      this.context.logger?.log(`Loading module ${module.name}@${module.version}`);

      const routes = await this.collectRoutes(module);
      this.assertRouteOwnership(module.name, routes);
      const metadata = await this.activateModule(module, routes);

      this.monitor.completeBuild(buildId, 'success');
      this.context.logger?.log(`Module ${module.name} registered with ${routes.length} routes`);
      return metadata;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.monitor.completeBuild(buildId, 'error', message);
      throw error;
    }
  }

  private async collectRoutes(
    module: RuntimeModule<Request, Response>
  ): Promise<readonly RouteDefinition<Request, Response>[]> {
    const routes = new Map<string, RouteDefinition<Request, Response>>();
    const endpoints = new Set<string>();
    const stagingAdapter: HttpAdapter<Request, Response> = {
      registerRoute: definition => {
        this.assertRouteDefinition(definition);
        if (routes.has(definition.id)) {
          throw new Error(`Module ${module.name} registered duplicate route id ${definition.id}`);
        }

        const endpoint = `${definition.method} ${definition.path}`;
        if (endpoints.has(endpoint)) {
          throw new Error(`Module ${module.name} registered duplicate endpoint ${endpoint}`);
        }

        routes.set(definition.id, Object.freeze({ ...definition }));
        endpoints.add(endpoint);
      },
      unregisterRoute: id => {
        const definition = routes.get(id);
        if (definition) {
          endpoints.delete(`${definition.method} ${definition.path}`);
          routes.delete(id);
        }
      }
    };

    await module.register(Object.freeze({ ...this.context, http: stagingAdapter }));
    return Object.freeze(Array.from(routes.values()));
  }

  private assertRouteDefinition(definition: RouteDefinition<Request, Response>): void {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError('Route definition must be an object');
    }
    if (typeof definition.id !== 'string' || definition.id.trim().length === 0) {
      throw new TypeError('Route id must be a non-empty string');
    }
    if (!HTTP_METHODS.has(definition.method)) {
      throw new TypeError(`Unsupported HTTP method: ${String(definition.method)}`);
    }
    if (typeof definition.path !== 'string' || !definition.path.startsWith('/')) {
      throw new TypeError(`Route ${definition.id} must use an absolute path beginning with /`);
    }
    if (typeof definition.handler !== 'function') {
      throw new TypeError(`Route ${definition.id} handler must be a function`);
    }
  }

  private assertRouteOwnership(
    moduleName: string,
    routes: readonly RouteDefinition<Request, Response>[]
  ): void {
    const routeIds = new Set(routes.map(route => route.id));
    const endpoints = new Set(routes.map(route => `${route.method} ${route.path}`));

    for (const metadata of this.registry.list()) {
      if (metadata.module.name === moduleName) {
        continue;
      }

      for (const route of metadata.registeredRoutes) {
        if (routeIds.has(route.id)) {
          throw new Error(`Route id ${route.id} is already owned by module ${metadata.module.name}`);
        }
        if (endpoints.has(`${route.method} ${route.path}`)) {
          throw new Error(`${route.method} ${route.path} is already owned by module ${metadata.module.name}`);
        }
      }
    }
  }

  private async activateModule(
    module: RuntimeModule<Request, Response>,
    routes: readonly RouteDefinition<Request, Response>[]
  ): Promise<ModuleMetadata<Request, Response>> {
    const previous = this.registry.get(module.name);
    const previousRoutes = previous?.registeredRoutes ?? [];
    const activatedRoutes: RouteDefinition<Request, Response>[] = [];

    for (const route of previousRoutes) {
      this.context.http.unregisterRoute(route.id);
    }

    try {
      for (const route of routes) {
        this.context.http.registerRoute(route);
        activatedRoutes.push(route);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];

      for (const route of activatedRoutes.reverse()) {
        try {
          this.context.http.unregisterRoute(route.id);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      for (const route of previousRoutes) {
        try {
          this.context.http.registerRoute(route);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], `Module ${module.name} activation and rollback failed`);
      }
      throw error;
    }

    const metadata = this.registry.register(module, routes);
    this.monitor.registerModule(module.name, module.version, routes.length);

    if (previous?.module.dispose) {
      try {
        await previous.module.dispose();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.context.logger?.warn(`Previous module ${module.name} cleanup failed: ${message}`);
      }
    }

    return metadata;
  }

  private async unloadInternal(moduleName: string): Promise<boolean> {
    const metadata = this.registry.get(moduleName);
    if (!metadata) {
      this.context.logger?.warn(`Module not found: ${moduleName}`);
      return false;
    }

    const errors: unknown[] = [];
    for (const route of metadata.registeredRoutes) {
      try {
        this.context.http.unregisterRoute(route.id);
      } catch (error) {
        errors.push(error);
      }
    }

    if (metadata.module.dispose) {
      try {
        await metadata.module.dispose();
      } catch (error) {
        errors.push(error);
      }
    }

    this.registry.unregister(moduleName);
    this.monitor.unregisterModule(moduleName);
    this.context.logger?.log(`Module ${moduleName} unloaded`);

    if (errors.length > 0) {
      throw new AggregateError(errors, `Module ${moduleName} did not unload cleanly`);
    }

    return true;
  }

  private async stopDashboard(): Promise<void> {
    if (!this.dashboard) {
      return;
    }

    await this.dashboard.stop();
    this.dashboard = undefined;
    this.dashboardAddress = undefined;
  }

  private runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}
