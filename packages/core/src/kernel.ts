import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
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
  LogContextFields,
  ModuleMetadata,
  RouteDefinition,
  RuntimeContext,
  RuntimeModule
} from './types';
import { VersionStore, type ModuleRevision } from './versioning';
import { ModuleWatcher } from './watcher';

const HTTP_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

interface RouteTarget<Request, Response> {
  route: RouteDefinition<Request, Response>;
}

export interface KernelEventMap<Request, Response> {
  'module:loaded': [ModuleMetadata<Request, Response>];
  'module:unloaded': [string];
  'module:failed': [{ modulePath: string; error: unknown }];
  'module:rolledBack': [{ moduleName: string; revision: number }];
  'watch:event': [{ kind: 'add' | 'change' | 'remove'; path: string }];
  error: [unknown];
}

export class Kernel<Request = unknown, Response = unknown> extends EventEmitter {
  private readonly registry = new ModuleRegistry<Request, Response>();
  private readonly loader = new ModuleLoader();
  private readonly monitor: Monitor;
  private readonly config: ResolvedKernelConfig;
  private readonly versions?: VersionStore;
  private readonly modulePaths = new Map<string, string>();
  private readonly routeTargets = new WeakMap<
    RouteDefinition<Request, Response>,
    RouteTarget<Request, Response>
  >();
  private pendingOperation: Promise<void> = Promise.resolve();
  private dashboard?: Dashboard;
  private dashboardAddress?: DashboardAddress;
  private dashboardStart?: Promise<DashboardAddress>;
  private watcher?: ModuleWatcher;

  constructor(
    private readonly context: RuntimeContext<Request, Response>,
    config: KernelConfig = {}
  ) {
    super();
    this.config = resolveKernelConfig(config);
    this.monitor = new Monitor(this.config.buildHistoryLimit);
    this.versions = this.config.versioning.enabled
      ? new VersionStore({
          directory: this.config.versioning.directory,
          keep: this.config.versioning.keep
        })
      : undefined;
  }

  /**
   * Boots the kernel: starts the dashboard when enabled, then — in autonomous mode —
   * discovers and loads every module under the configured paths and keeps watching them.
   * After this resolves no manual `reload` call is required; editing a module file is
   * enough.
   */
  async start(): Promise<DashboardAddress | undefined> {
    const address = await this.startDashboard();
    await this.startAutonomous();
    return address;
  }

  private async startDashboard(): Promise<DashboardAddress | undefined> {
    if (!this.config.dashboard.enabled) {
      return undefined;
    }
    if (this.dashboardAddress) {
      return this.dashboardAddress;
    }
    if (this.dashboardStart) {
      return this.dashboardStart;
    }

    this.dashboard = new Dashboard(this.monitor, this.config.dashboard, password => {
      this.write('warn', `Dashboard password (shown once): ${password}`, { password });
    });
    this.dashboardStart = this.dashboard.start();

    try {
      this.dashboardAddress = await this.dashboardStart;
      this.write('info', `Dashboard ready at ${this.dashboardAddress.url}`, {
        url: this.dashboardAddress.url
      });
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
    this.unwatch();

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

  /** Whether the filesystem supervisor is currently running. */
  get autonomous(): boolean {
    return this.watcher !== undefined;
  }

  /**
   * Starts the supervisor without waiting for `start()`. Returns the module files it is
   * watching. Safe to call twice; the second call is a no-op.
   */
  watch(): readonly string[] {
    if (this.watcher) {
      return this.watcher.list();
    }

    const options = this.config.autonomous;
    const watcher = new ModuleWatcher({
      paths: options.paths,
      extensions: options.extensions,
      ignore: options.ignore,
      debounce: options.debounce
    });

    watcher.on('error', error => this.report(error, 'Module watcher failed'));
    watcher.on('all', event => this.emit('watch:event', event));
    watcher.on('add', modulePath => void this.superviseLoad(modulePath, 'add'));
    watcher.on('change', modulePath => void this.superviseLoad(modulePath, 'change'));
    watcher.on('remove', modulePath => void this.superviseRemoval(modulePath));

    const discovered = watcher.start();
    this.watcher = watcher;
    this.write('info', `Autonomous mode watching ${discovered.length} module files`, {
      paths: options.paths,
      modules: discovered.length
    });

    return discovered;
  }

  /** Stops the supervisor. Loaded modules keep serving traffic. */
  unwatch(): void {
    if (!this.watcher) {
      return;
    }

    this.watcher.removeAllListeners();
    this.watcher.stop();
    this.watcher = undefined;
    this.write('info', 'Autonomous mode stopped');
  }

  /** Recorded revisions for a module, oldest first. Empty when versioning is disabled. */
  history(moduleName: string): readonly ModuleRevision[] {
    return this.versions?.history(moduleName) ?? [];
  }

  /** Modules with a recorded history, including ones that are not currently loaded. */
  versioned(): readonly string[] {
    return this.versions?.modules() ?? [];
  }

  /**
   * Restores a previously recorded source revision and reloads the module. The snapshot is
   * written back to the module's own path, so relative imports inside it keep resolving.
   * Defaults to the revision immediately before the active one.
   */
  rollback(moduleName: string, revision?: number): Promise<ModuleMetadata<Request, Response>> {
    return this.runExclusive(() => this.rollbackInternal(moduleName, revision));
  }

  private async startAutonomous(): Promise<void> {
    const options = this.config.autonomous;
    if (!options.enabled) {
      return;
    }

    const discovered = this.watch();
    if (!options.loadOnStart) {
      return;
    }

    for (const modulePath of discovered) {
      try {
        await this.load(modulePath);
      } catch (error) {
        this.report(error, `Initial load failed for ${modulePath}`, { modulePath });
      }
    }
  }

  private async superviseLoad(modulePath: string, reason: 'add' | 'change'): Promise<void> {
    const options = this.config.autonomous;
    const attempts = options.retries + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        this.write('debug', `Autonomous ${reason} detected`, { modulePath, attempt });
        await this.load(modulePath);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await delay(options.retryDelay);
        }
      }
    }

    this.report(lastError, `Autonomous reload failed for ${modulePath}`, { modulePath, reason });
    this.emit('module:failed', { modulePath, error: lastError });

    if (options.autoRollback) {
      await this.autoRollback(modulePath);
    }
  }

  private async superviseRemoval(modulePath: string): Promise<void> {
    if (!this.config.autonomous.unloadOnDelete) {
      return;
    }

    const moduleName = this.modulePaths.get(path.resolve(modulePath));
    if (!moduleName) {
      return;
    }

    try {
      await this.unload(moduleName);
    } catch (error) {
      this.report(error, `Autonomous unload failed for ${moduleName}`, { moduleName, modulePath });
    }
  }

  private async autoRollback(modulePath: string): Promise<void> {
    const moduleName = this.modulePaths.get(path.resolve(modulePath));
    if (!moduleName || !this.versions) {
      return;
    }

    try {
      // A failed reload leaves the last good revision active. `rollback()` without an
      // argument intentionally means "go to the revision before the active one" for
      // manual rollback, but autonomous recovery must restore the active snapshot itself.
      const current = this.versions.current(moduleName);
      if (!current) {
        return;
      }

      const metadata = await this.rollback(moduleName, current.revision);
      this.write('warn', `Rolled ${moduleName} back to the last known good revision`, {
        moduleName,
        version: metadata.module.version
      });
    } catch (error) {
      this.report(error, `Automatic rollback failed for ${moduleName}`, { moduleName });
    }
  }

  private async rollbackInternal(
    moduleName: string,
    revision?: number
  ): Promise<ModuleMetadata<Request, Response>> {
    const store = this.versions;
    if (!store) {
      throw new Error('Rollback requires versioning to be enabled');
    }

    const target = revision === undefined ? store.previous(moduleName) : store.get(moduleName, revision);
    if (!target) {
      throw new Error(
        revision === undefined
          ? `No earlier revision recorded for ${moduleName}`
          : `Revision ${revision} of ${moduleName} was not found`
      );
    }
    if (target.status === 'failed') {
      throw new Error(`Revision ${target.revision} of ${moduleName} failed to load and cannot be restored`);
    }

    const source = store.readSnapshot(target);
    fs.writeFileSync(target.modulePath, source);

    const metadata = await this.loadInternal(target.modulePath, target.revision);
    this.emit('module:rolledBack', { moduleName, revision: target.revision });
    this.write('info', `Restored ${moduleName} to revision ${target.revision}`, {
      moduleName,
      revision: target.revision
    });

    return metadata;
  }

  private async loadInternal(
    modulePath: string,
    restoredFrom?: number
  ): Promise<ModuleMetadata<Request, Response>> {
    const buildId = this.monitor.startBuild(path.basename(modulePath), modulePath);

    try {
      const module = await this.loader.load<Request, Response>(modulePath);
      this.monitor.identifyBuild(buildId, module.name);
      this.write('debug', `Loading module ${module.name}@${module.version}`, {
        module: module.name,
        version: module.version,
        modulePath
      });

      const routes = await this.collectRoutes(module);
      this.assertRouteOwnership(module.name, routes);
      const metadata = await this.activateModule(module, routes);

      this.modulePaths.set(path.resolve(modulePath), module.name);
      const recorded = this.versions?.record({
        moduleName: module.name,
        modulePath,
        version: module.version,
        restoredFrom
      });

      this.monitor.completeBuild(buildId, 'success');
      this.write('info', `Module ${module.name} registered with ${routes.length} routes`, {
        module: module.name,
        version: module.version,
        routes: routes.length,
        revision: recorded?.revision
      });
      this.emit('module:loaded', metadata);
      return metadata;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.monitor.completeBuild(buildId, 'error', message);

      const moduleName = this.modulePaths.get(path.resolve(modulePath));
      if (moduleName) {
        this.versions?.recordFailure(moduleName, modulePath, message);
      }

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
    const previousById = new Map(previousRoutes.map(route => [route.id, route]));
    const nextIds = new Set(routes.map(route => route.id));
    const activatedRoutes: RouteDefinition<Request, Response>[] = [];
    const addedRoutes: RouteDefinition<Request, Response>[] = [];
    const replacedRoutes: RouteDefinition<Request, Response>[] = [];
    const removedRoutes: RouteDefinition<Request, Response>[] = [];
    const targetUpdates: Array<{
      target: RouteTarget<Request, Response>;
      route: RouteDefinition<Request, Response>;
    }> = [];

    try {
      for (const route of routes) {
        const previousRoute = previousById.get(route.id);
        const target = previousRoute && this.routeTargets.get(previousRoute);
        if (previousRoute && target && this.canReuseRoute(previousRoute, route)) {
          activatedRoutes.push(previousRoute);
          targetUpdates.push({ target, route });
          continue;
        }

        const monitoredRoute = this.monitorRoute(module.name, route);
        this.context.http.registerRoute(monitoredRoute);
        activatedRoutes.push(monitoredRoute);
        if (previousRoute) {
          replacedRoutes.push(previousRoute);
        } else {
          addedRoutes.push(monitoredRoute);
        }
      }

      for (const route of previousRoutes) {
        if (!nextIds.has(route.id)) {
          this.context.http.unregisterRoute(route.id);
          removedRoutes.push(route);
        }
      }

      for (const update of targetUpdates) {
        update.target.route = update.route;
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];

      for (const route of removedRoutes.reverse()) {
        try {
          this.context.http.registerRoute(route);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      for (const route of replacedRoutes.reverse()) {
        try {
          this.context.http.registerRoute(route);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      for (const route of addedRoutes.reverse()) {
        try {
          this.context.http.unregisterRoute(route.id);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }

      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], `Module ${module.name} activation and rollback failed`);
      }
      throw error;
    }

    const metadata = this.registry.register(module, activatedRoutes);
    this.monitor.registerModule(module.name, module.version, routes);

    if (previous?.module.dispose) {
      try {
        await previous.module.dispose();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.write('warn', `Previous module ${module.name} cleanup failed: ${message}`, {
          module: module.name
        });
      }
    }

    return metadata;
  }

  private monitorRoute(
    moduleName: string,
    route: RouteDefinition<Request, Response>
  ): RouteDefinition<Request, Response> {
    const target: RouteTarget<Request, Response> = { route };
    const monitoredRoute: RouteDefinition<Request, Response> = Object.freeze({
      id: route.id,
      method: route.method,
      path: route.path,
      get version() {
        return target.route.version;
      },
      get status() {
        return target.route.status;
      },
      handler: async (request: Request, response: Response) => {
        this.monitor.startRequest(moduleName, route.id);
        const startedAt = performance.now();
        let failed = false;
        try {
          return await target.route.handler(request, response);
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          this.monitor.completeRequest(moduleName, route.id, performance.now() - startedAt, failed);
        }
      }
    });
    this.routeTargets.set(monitoredRoute, target);
    return monitoredRoute;
  }

  private canReuseRoute(
    current: RouteDefinition<Request, Response>,
    next: RouteDefinition<Request, Response>
  ): boolean {
    return current.method === next.method
      && current.path === next.path
      && current.status === next.status;
  }

  private async unloadInternal(moduleName: string): Promise<boolean> {
    const metadata = this.registry.get(moduleName);
    if (!metadata) {
      this.write('warn', `Module not found: ${moduleName}`, { module: moduleName });
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

    for (const [modulePath, name] of this.modulePaths) {
      if (name === moduleName) {
        this.modulePaths.delete(modulePath);
      }
    }

    this.write('info', `Module ${moduleName} unloaded`, { module: moduleName });
    this.emit('module:unloaded', moduleName);

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

  /**
   * Routes a message to the configured logger, preferring its structured methods when the
   * implementation provides them and falling back to the legacy three-method contract.
   */
  private write(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: LogContextFields,
    error?: unknown
  ): void {
    const logger = this.context.logger;
    if (!logger) {
      return;
    }

    switch (level) {
      case 'debug':
        (logger.debug ?? logger.log).call(logger, message, fields);
        return;
      case 'info':
        (logger.info ?? logger.log).call(logger, message, fields);
        return;
      case 'warn':
        logger.warn(message, fields);
        return;
      case 'error':
        logger.error(message, fields, error);
    }
  }

  private report(error: unknown, message: string, fields?: LogContextFields): void {
    this.write('error', message, fields, error);

    // Emitting `error` without a listener would throw, which must never take down a host
    // application just because a module failed to reload.
    if (this.listenerCount('error') > 0) {
      this.emit('error', error);
    }
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

function delay(milliseconds: number): Promise<void> {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    setTimeout(resolve, milliseconds).unref?.();
  });
}
