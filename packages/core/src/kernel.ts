import { RuntimeContext, RuntimeModule } from './types';
import { ModuleRegistry } from './module-registry';
import { ModuleLoader } from './loader';
import { Monitor } from './monitoring/monitor';
import { Dashboard } from './monitoring/dashboard';
import { MonitoringConfig } from './monitoring/types';

export class Kernel {
  private registry: ModuleRegistry;
  private loader: ModuleLoader;
  private context: RuntimeContext;
  private routeTracker = new Map<string, string[]>();
  private monitor: Monitor;
  private dashboard?: Dashboard;
  private config: MonitoringConfig;

  constructor(context: RuntimeContext, config: MonitoringConfig = { liveRunnerActions: false }) {
    this.context = context;
    this.registry = new ModuleRegistry();
    this.loader = new ModuleLoader();
    this.monitor = new Monitor();
    this.config = config;

    if (config.liveRunnerActions) {
      this.startDashboard(config.port, config.host);
    }
  }

  private async startDashboard(port?: number, host?: string): Promise<void> {
    try {
      this.dashboard = new Dashboard(this.monitor, port || 0, host || 'localhost');
      await this.dashboard.start();
    } catch (error) {
      this.context.logger?.error(`[Deploy4Me] Failed to start dashboard: ${error}`);
    }
  }

  stopDashboard(): void {
    if (this.dashboard) {
      this.dashboard.stop();
      this.dashboard = undefined;
    }
  }

  getMonitor(): Monitor {
    return this.monitor;
  }

  async load(modulePath: string): Promise<void> {
    const buildId = this.monitor.startBuild('unknown', modulePath);
    
    try {
      const module = await this.loader.load(modulePath);
      this.monitor.completeBuild(buildId, 'success');
      this.monitor.startBuild(module.name, modulePath);
      
      // Unload existing module if present
      if (this.registry.has(module.name)) {
        await this.unload(module.name);
      }

      this.context.logger?.log(`[Deploy4Me] Loading module: ${module.name}@${module.version}`);

      // Track routes registered during module.register()
      const routeIds: string[] = [];
      const originalRegister = this.context.http.registerRoute.bind(this.context.http);
      
      this.context.http.registerRoute = (definition) => {
        routeIds.push(definition.id);
        originalRegister(definition);
      };

      // Register module
      module.register(this.context);

      // Restore original registerRoute
      this.context.http.registerRoute = originalRegister;

      // Store in registry
      this.registry.register(module, routeIds);
      this.routeTracker.set(module.name, routeIds);

      // Register in monitor
      this.monitor.registerModule(module.name, module.version, routeIds.length);

      this.context.logger?.log(`[Deploy4Me] Module registered: ${module.name} (${routeIds.length} routes)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.monitor.completeBuild(buildId, 'error', errorMessage);
      throw error;
    }
  }

  async unload(moduleName: string): Promise<void> {
    const metadata = this.registry.get(moduleName);
    if (!metadata) {
      this.context.logger?.warn(`[Deploy4Me] Module not found: ${moduleName}`);
      return;
    }

    this.context.logger?.log(`[Deploy4Me] Unloading module: ${moduleName}`);

    // Call dispose if exists
    if (metadata.module.dispose) {
      metadata.module.dispose();
    }

    // Unregister all routes
    const routeIds = this.routeTracker.get(moduleName) || [];
    for (const routeId of routeIds) {
      this.context.http.unregisterRoute(routeId);
    }

    // Remove from registry
    this.registry.unregister(moduleName);
    this.routeTracker.delete(moduleName);

    // Unregister from monitor
    this.monitor.unregisterModule(moduleName);

    this.context.logger?.log(`[Deploy4Me] Module unloaded: ${moduleName}`);
  }

  async reload(modulePath: string): Promise<void> {
    await this.load(modulePath);
  }

  list() {
    return this.registry.list();
  }

  get(moduleName: string) {
    return this.registry.get(moduleName);
  }
}
