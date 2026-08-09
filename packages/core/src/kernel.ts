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
  RouteBatchOperation,
  RouteDefinition,
  RuntimeContext,
  RuntimeModule
} from './types';
import { supportsRouteBatch } from './types';
import { VersionStore, type ModuleRevision } from './versioning';
import { ModuleWatcher } from './watcher';

const HTTP_METHODS = new Set<HttpMethod>(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

interface RouteGeneration<Request, Response> {
  readonly route: RouteDefinition<Request, Response>;
  activeRequests: number;
  readonly drainWaiters: Set<() => void>;
}

interface RouteTarget<Request, Response> {
  generation: RouteGeneration<Request, Response>;
}

interface AppliedActivation<Request, Response> {
  readonly previous?: ModuleMetadata<Request, Response>;
  readonly previousGenerations: readonly RouteGeneration<Request, Response>[];
  readonly routes: readonly RouteDefinition<Request, Response>[];
  rollback(): void;
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
  private readonly moduleSources = new Map<string, string>();
  private readonly moduleDependencies = new Map<string, readonly string[]>();
  private readonly dependencyOwners = new Map<string, Set<string>>();
  private readonly routeTargets = new WeakMap<
    RouteDefinition<Request, Response>,
    RouteTarget<Request, Response>
  >();
  private pendingOperation: Promise<void> = Promise.resolve();
  private pendingOperationCount = 0;
  private readonly retiredCleanups = new Set<Promise<void>>();
  private dashboard?: Dashboard;
  private dashboardAddress?: DashboardAddress;
  private dashboardStart?: Promise<DashboardAddress>;
  private watcher?: ModuleWatcher;
  private monitoringTimer?: NodeJS.Timeout;
  private exportingMonitoring = false;

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
    this.startMonitoringExporter();
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
      process.stderr.write(`Hivelet dashboard password (shown once): ${password}\n`);
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
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = undefined;
    }

    return this.runExclusive(async () => {
      const errors: unknown[] = [];

      for (const metadata of this.registry.list()) {
        try {
          await this.unloadInternal(metadata.module.name);
        } catch (error) {
          errors.push(error);
        }
      }

      if (this.retiredCleanups.size > 0) {
        const pending = Promise.allSettled([...this.retiredCleanups]);
        const cleanups = this.config.lifecycle.drainTimeout === 0
          ? await pending
          : await Promise.race([
              pending,
              delay(this.config.lifecycle.drainTimeout).then(() => undefined)
            ]);
        if (!cleanups) {
          errors.push(new Error('Timed out waiting for retired module cleanup'));
        } else {
          for (const cleanup of cleanups) {
            if (cleanup.status === 'rejected') errors.push(cleanup.reason);
          }
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

  async flushMonitoring(): Promise<void> {
    const exporter = this.config.monitoring.exporter;
    if (!exporter || this.exportingMonitoring) return;
    this.exportingMonitoring = true;
    try {
      await exporter.export(this.status());
    } finally {
      this.exportingMonitoring = false;
    }
  }

  private startMonitoringExporter(): void {
    if (!this.config.monitoring.exporter || this.monitoringTimer) return;
    this.monitoringTimer = setInterval(() => {
      void this.flushMonitoring().catch(error => this.report(error, 'Monitoring export failed'));
    }, this.config.monitoring.exportInterval);
    this.monitoringTimer.unref?.();
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
      entrySuffix: options.entrySuffix,
      ignore: options.ignore,
      debounce: options.debounce
    });

    watcher.on('error', error => this.report(error, 'Module watcher failed'));
    watcher.on('all', event => this.publish('watch:event', event));
    watcher.on('add', modulePath => void this.superviseLoad(modulePath, 'add'));
    watcher.on('change', modulePath => void this.superviseLoad(modulePath, 'change'));
    watcher.on('remove', modulePath => void this.superviseRemoval(modulePath));
    watcher.on('dependency', dependencyPath => void this.superviseDependency(dependencyPath));

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
    this.publish('module:failed', { modulePath, error: lastError });

    if (options.autoRollback) {
      await this.autoRollback(modulePath);
    }
  }

  private async superviseRemoval(modulePath: string): Promise<void> {
    if (!this.config.autonomous.unloadOnDelete) {
      return;
    }

    const resolvedPath = path.resolve(modulePath);
    const moduleName = this.modulePaths.get(resolvedPath)
      ?? this.modulePaths.get(this.canonicalizeParent(resolvedPath));
    if (!moduleName) {
      return;
    }

    try {
      await this.unload(moduleName);
    } catch (error) {
      this.report(error, `Autonomous unload failed for ${moduleName}`, { moduleName, modulePath });
    }
  }

  private async superviseDependency(dependencyPath: string): Promise<void> {
    const resolvedPath = path.resolve(dependencyPath);
    const owners = [...(
      this.dependencyOwners.get(resolvedPath)
      ?? this.dependencyOwners.get(this.canonicalizeParent(resolvedPath))
      ?? []
    )].sort();
    for (const owner of owners) {
      await this.superviseLoad(owner, 'change');
    }
  }

  private async autoRollback(modulePath: string): Promise<void> {
    const resolvedPath = path.resolve(modulePath);
    const moduleName = this.modulePaths.get(resolvedPath)
      ?? this.modulePaths.get(this.canonicalizeParent(resolvedPath));
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
    this.replaceFileAtomically(target.modulePath, source);

    const metadata = await this.loadInternal(target.modulePath, target.revision);
    this.publish('module:rolledBack', { moduleName, revision: target.revision });
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
    const resolvedPath = path.resolve(modulePath);
    const buildId = this.monitor.startBuild(path.basename(modulePath), resolvedPath);
    let candidate: RuntimeModule<Request, Response> | undefined;
    let candidateEntryPath: string | undefined;
    let candidateCommitted = false;
    let preparedRevision: ReturnType<VersionStore['prepare']> | undefined;

    try {
      const loaded = await this.loader.loadTracked<Request, Response>(resolvedPath);
      const module = loaded.module;
      candidate = module;
      candidateEntryPath = loaded.entryPath;
      this.assertModuleIdentity(module.name, loaded.entryPath);
      this.monitor.identifyBuild(buildId, module.name);
      this.write('debug', `Loading module ${module.name}@${module.version}`, {
        module: module.name,
        version: module.version,
        modulePath: resolvedPath
      });

      const routes = await this.collectRoutes(module);
      const dependencies = this.loader.dependencies(loaded.entryPath);
      this.assertCapacity(module.name, routes.length);
      this.assertRouteOwnership(module.name, routes);
      preparedRevision = this.versions?.prepare({
        moduleName: module.name,
        modulePath: resolvedPath,
        version: module.version,
        restoredFrom,
        source: loaded.source
      });
      const activation = this.applyActivation(module, routes);

      let recorded: ModuleRevision | undefined;
      try {
        recorded = preparedRevision?.commit();
      } catch (error) {
        activation.rollback();
        throw error;
      }

      const metadata = this.registry.register(module, activation.routes);
      this.monitor.registerModule(module.name, module.version, routes);
      this.modulePaths.set(resolvedPath, module.name);
      this.modulePaths.set(loaded.entryPath, module.name);
      this.moduleSources.set(module.name, loaded.entryPath);
      this.updateDependencies(loaded.entryPath, dependencies);
      this.loader.commit(loaded.entryPath, dependencies);
      candidateCommitted = true;

      this.monitor.completeBuild(buildId, 'success');
      this.write('info', `Module ${module.name} registered with ${routes.length} routes`, {
        module: module.name,
        version: module.version,
        routes: routes.length,
        revision: recorded?.revision
      });
      this.publish('module:loaded', metadata);
      await this.retireModule(activation.previous, activation.previousGenerations, false);
      return metadata;
    } catch (error) {
      preparedRevision?.abort();
      if (candidate && !candidateCommitted) {
        await this.disposeCandidate(candidate);
      }
      if (candidateEntryPath && !candidateCommitted) {
        this.loader.discard(candidateEntryPath);
      }
      const message = error instanceof Error ? error.message : String(error);
      this.monitor.completeBuild(buildId, 'error', message);

      const moduleName = candidate?.name ?? this.modulePaths.get(resolvedPath);
      if (moduleName) {
        try {
          this.versions?.recordFailure(moduleName, resolvedPath, message);
        } catch (historyError) {
          this.report(historyError, `Failed to record rejected revision for ${moduleName}`, { moduleName });
        }
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

  private assertCapacity(moduleName: string, routeCount: number): void {
    const existing = this.registry.get(moduleName);
    const modules = this.registry.list();
    if (!existing && modules.length >= this.config.capacity.maxModules) {
      throw new Error(`Module capacity exceeded (${this.config.capacity.maxModules})`);
    }
    if (routeCount > this.config.capacity.maxRoutesPerModule) {
      throw new Error(`Module ${moduleName} exceeds its route capacity (${this.config.capacity.maxRoutesPerModule})`);
    }
    const currentTotal = modules.reduce((total, metadata) =>
      total + (metadata.module.name === moduleName ? 0 : metadata.registeredRoutes.length), 0);
    if (currentTotal + routeCount > this.config.capacity.maxTotalRoutes) {
      throw new Error(`Total route capacity exceeded (${this.config.capacity.maxTotalRoutes})`);
    }
  }

  private applyActivation(
    module: RuntimeModule<Request, Response>,
    routes: readonly RouteDefinition<Request, Response>[]
  ): AppliedActivation<Request, Response> {
    const previous = this.registry.get(module.name);
    const previousRoutes = previous?.registeredRoutes ?? [];
    const previousById = new Map(previousRoutes.map(route => [route.id, route]));
    const nextIds = new Set(routes.map(route => route.id));
    const activatedRoutes: RouteDefinition<Request, Response>[] = [];
    const changes: Array<{
      forward: RouteBatchOperation<Request, Response>;
      inverse: RouteBatchOperation<Request, Response>;
    }> = [];
    const previousGenerations = new Set<RouteGeneration<Request, Response>>();
    const targetUpdates: Array<{
      target: RouteTarget<Request, Response>;
      previous: RouteGeneration<Request, Response>;
      next: RouteGeneration<Request, Response>;
    }> = [];

    for (const route of routes) {
      const previousRoute = previousById.get(route.id);
      const target = previousRoute && this.routeTargets.get(previousRoute);
      if (previousRoute && target && this.canReuseRoute(previousRoute, route)) {
        const next = this.createGeneration(route);
        activatedRoutes.push(previousRoute);
        previousGenerations.add(target.generation);
        targetUpdates.push({ target, previous: target.generation, next });
        continue;
      }

      const monitoredRoute = this.monitorRoute(module.name, route);
      activatedRoutes.push(monitoredRoute);
      changes.push({
        forward: { kind: 'register', definition: monitoredRoute },
        inverse: previousRoute
          ? { kind: 'register', definition: previousRoute }
          : { kind: 'unregister', id: monitoredRoute.id }
      });
      if (previousRoute) {
        const oldTarget = this.routeTargets.get(previousRoute);
        if (oldTarget) previousGenerations.add(oldTarget.generation);
      }
    }

    for (const route of previousRoutes) {
      if (!nextIds.has(route.id)) {
        const target = this.routeTargets.get(route);
        if (target) previousGenerations.add(target.generation);
        changes.push({
          forward: { kind: 'unregister', id: route.id },
          inverse: { kind: 'register', definition: route }
        });
      }
    }

    const rollbackRoutes = this.applyRouteChanges(changes);
    for (const update of targetUpdates) {
      update.target.generation = update.next;
    }

    let rolledBack = false;
    return {
      previous,
      previousGenerations: [...previousGenerations],
      routes: activatedRoutes,
      rollback: () => {
        if (rolledBack) return;
        rolledBack = true;
        const errors: unknown[] = [];
        for (const update of targetUpdates) {
          update.target.generation = update.previous;
        }
        try {
          rollbackRoutes();
        } catch (error) {
          errors.push(error);
        }
        if (errors.length > 0) {
          throw new AggregateError(errors, `Module ${module.name} rollback failed`);
        }
      }
    };
  }

  private monitorRoute(
    moduleName: string,
    route: RouteDefinition<Request, Response>
  ): RouteDefinition<Request, Response> {
    const target: RouteTarget<Request, Response> = { generation: this.createGeneration(route) };
    const monitoredRoute: RouteDefinition<Request, Response> = Object.freeze({
      id: route.id,
      method: route.method,
      path: route.path,
      get version() {
        return target.generation.route.version;
      },
      get status() {
        return target.generation.route.status;
      },
      handler: async (request: Request, response: Response) => {
        const generation = target.generation;
        generation.activeRequests += 1;
        this.monitor.startRequest(moduleName, route.id);
        const startedAt = performance.now();
        let failed = false;
        try {
          return await generation.route.handler(request, response);
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          generation.activeRequests = Math.max(0, generation.activeRequests - 1);
          if (generation.activeRequests === 0) {
            for (const resolve of generation.drainWaiters) resolve();
            generation.drainWaiters.clear();
          }
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

  private createGeneration(route: RouteDefinition<Request, Response>): RouteGeneration<Request, Response> {
    return { route, activeRequests: 0, drainWaiters: new Set() };
  }

  private applyRouteChanges(changes: readonly {
    forward: RouteBatchOperation<Request, Response>;
    inverse: RouteBatchOperation<Request, Response>;
  }[]): () => void {
    if (changes.length === 0) {
      return () => undefined;
    }

    const adapter = this.context.http;
    if (supportsRouteBatch(adapter)) {
      adapter.applyRouteBatch(changes.map(change => change.forward));
      return () => adapter.applyRouteBatch(changes.slice().reverse().map(change => change.inverse));
    }

    const applied: typeof changes[number][] = [];
    try {
      for (const change of changes) {
        this.applyRouteOperation(change.forward);
        applied.push(change);
      }
    } catch (error) {
      const rollbackErrors: unknown[] = [];
      for (const change of applied.reverse()) {
        try {
          this.applyRouteOperation(change.inverse);
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
      }
      if (rollbackErrors.length > 0) {
        throw new AggregateError([error, ...rollbackErrors], 'Route activation and rollback failed');
      }
      throw error;
    }

    return () => {
      const errors: unknown[] = [];
      for (const change of applied.slice().reverse()) {
        try {
          this.applyRouteOperation(change.inverse);
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Route rollback failed');
      }
    };
  }

  private applyRouteOperation(operation: RouteBatchOperation<Request, Response>): void {
    if (operation.kind === 'register') {
      this.context.http.registerRoute(operation.definition);
    } else {
      this.context.http.unregisterRoute(operation.id);
    }
  }

  private async retireModule(
    metadata: ModuleMetadata<Request, Response> | undefined,
    generations: readonly RouteGeneration<Request, Response>[],
    strict: boolean
  ): Promise<void> {
    if (!metadata?.module.dispose) {
      return;
    }

    const drained = Promise.all(generations.map(generation => this.waitForDrain(generation))).then(() => undefined);
    const timeout = this.config.lifecycle.drainTimeout;
    if (timeout > 0 && generations.some(generation => generation.activeRequests > 0)) {
      const completed = await Promise.race([
        drained.then(() => true),
        delay(timeout).then(() => false)
      ]);
      if (!completed) {
        this.write('warn', `Module ${metadata.module.name} is still draining; cleanup deferred`, {
          module: metadata.module.name,
          drainTimeout: timeout
        });
        let cleanup: Promise<void>;
        cleanup = drained
          .then(() => this.disposeModule(metadata.module, strict))
          .finally(() => this.retiredCleanups.delete(cleanup));
        this.retiredCleanups.add(cleanup);
        return;
      }
    } else {
      await drained;
    }

    await this.disposeModule(metadata.module, strict);
  }

  private waitForDrain(generation: RouteGeneration<Request, Response>): Promise<void> {
    if (generation.activeRequests === 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => generation.drainWaiters.add(resolve));
  }

  private async disposeModule(module: RuntimeModule<Request, Response>, strict: boolean): Promise<void> {
    if (!module.dispose) return;
    try {
      await module.dispose();
    } catch (error) {
      if (strict) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.write('warn', `Module ${module.name} cleanup failed: ${message}`, { module: module.name });
    }
  }

  private async disposeCandidate(module: RuntimeModule<Request, Response>): Promise<void> {
    const active = this.registry.get(module.name)?.module;
    if (active === module || !module.dispose) return;
    try {
      await module.dispose();
    } catch (error) {
      this.report(error, `Rejected module ${module.name} cleanup failed`, { module: module.name });
    }
  }

  private assertModuleIdentity(moduleName: string, modulePath: string): void {
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(moduleName)) {
      throw new TypeError(`Invalid module name ${moduleName}; use lowercase letters, numbers, hyphens, or underscores`);
    }
    const existingName = this.modulePaths.get(modulePath);
    if (existingName && existingName !== moduleName) {
      throw new Error(`Module path ${modulePath} is already owned by ${existingName}`);
    }
    const existingPath = this.moduleSources.get(moduleName);
    if (existingPath && existingPath !== modulePath) {
      throw new Error(`Module ${moduleName} is already loaded from ${existingPath}`);
    }
  }

  private updateDependencies(entryPath: string, dependencies: readonly string[]): void {
    const previous = this.moduleDependencies.get(entryPath) ?? [];
    for (const dependency of previous) {
      const owners = this.dependencyOwners.get(dependency);
      owners?.delete(entryPath);
      if (owners?.size === 0) this.dependencyOwners.delete(dependency);
    }
    this.moduleDependencies.set(entryPath, Object.freeze([...dependencies]));
    for (const dependency of dependencies) {
      const owners = this.dependencyOwners.get(dependency) ?? new Set<string>();
      owners.add(entryPath);
      this.dependencyOwners.set(dependency, owners);
    }
    this.watcher?.setDependencies([...this.dependencyOwners.keys()]);
  }

  private removeDependencies(entryPath: string): void {
    const dependencies = this.moduleDependencies.get(entryPath) ?? [];
    for (const dependency of dependencies) {
      const owners = this.dependencyOwners.get(dependency);
      owners?.delete(entryPath);
      if (owners?.size === 0) this.dependencyOwners.delete(dependency);
    }
    this.moduleDependencies.delete(entryPath);
    this.loader.forget(entryPath);
    this.watcher?.setDependencies([...this.dependencyOwners.keys()]);
  }

  private canonicalizeParent(target: string): string {
    try {
      return path.join(fs.realpathSync.native(path.dirname(target)), path.basename(target));
    } catch {
      return target;
    }
  }

  private replaceFileAtomically(target: string, source: Buffer): void {
    const resolved = path.resolve(target);
    const temporary = path.join(
      path.dirname(resolved),
      `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`
    );
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(descriptor, source);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      fs.renameSync(temporary, resolved);
    } catch (error) {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }

  private async unloadInternal(moduleName: string): Promise<boolean> {
    const metadata = this.registry.get(moduleName);
    if (!metadata) {
      this.write('warn', `Module not found: ${moduleName}`, { module: moduleName });
      return false;
    }

    const generations = metadata.registeredRoutes
      .map(route => this.routeTargets.get(route)?.generation)
      .filter((generation): generation is RouteGeneration<Request, Response> => generation !== undefined);
    const changes = metadata.registeredRoutes.map(route => ({
      forward: { kind: 'unregister', id: route.id } as const,
      inverse: { kind: 'register', definition: route } as const
    }));
    this.applyRouteChanges(changes);

    this.registry.unregister(moduleName);
    this.monitor.unregisterModule(moduleName);

    for (const [modulePath, name] of this.modulePaths) {
      if (name === moduleName) {
        this.modulePaths.delete(modulePath);
        this.removeDependencies(modulePath);
      }
    }
    this.moduleSources.delete(moduleName);

    this.write('info', `Module ${moduleName} unloaded`, { module: moduleName });
    this.publish('module:unloaded', moduleName);
    await this.retireModule(metadata, generations, true);

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

    try {
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
    } catch {
      // Logging must never change lifecycle transaction outcomes.
    }
  }

  private report(error: unknown, message: string, fields?: LogContextFields): void {
    this.write('error', message, fields, error);

    // Emitting `error` without a listener would throw, which must never take down a host
    // application just because a module failed to reload.
    if (this.listenerCount('error') > 0) {
      try {
        this.emit('error', error);
      } catch {
        // Error observers are isolated from the runtime lifecycle.
      }
    }
  }

  private publish(event: string, ...args: unknown[]): void {
    try {
      this.emit(event, ...args);
    } catch (error) {
      this.report(error, `Hivelet event listener failed for ${event}`, { event });
    }
  }

  private runExclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.pendingOperationCount >= this.config.lifecycle.maxPendingOperations) {
      return Promise.reject(new Error('Hivelet lifecycle queue is full'));
    }
    this.pendingOperationCount += 1;
    const result = this.pendingOperation.then(operation, operation);
    this.pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result.finally(() => {
      this.pendingOperationCount -= 1;
    });
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
