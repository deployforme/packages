import { randomUUID } from 'node:crypto';
import type {
  ActiveModule,
  BuildRecord,
  MonitoringSnapshot,
  MonitoringState,
  MonitoringStats
} from './types';

export class Monitor {
  private readonly maxBuilds: number;
  private readonly state: MonitoringState;

  constructor(maxBuilds = 100) {
    this.maxBuilds = maxBuilds;
    this.state = {
      builds: [],
      activeModules: new Map(),
      startTime: new Date()
    };
  }

  startBuild(moduleName: string, modulePath: string): string {
    const id = randomUUID();
    const record: BuildRecord = {
      id,
      moduleName,
      modulePath,
      status: 'building',
      startTime: new Date()
    };

    this.state.builds.unshift(record);
    if (this.state.builds.length > this.maxBuilds) {
      this.state.builds.length = this.maxBuilds;
    }

    return id;
  }

  identifyBuild(id: string, moduleName: string): void {
    const build = this.state.builds.find(record => record.id === id);
    if (build) {
      build.moduleName = moduleName;
    }
  }

  completeBuild(id: string, status: 'success' | 'error', error?: string): void {
    const build = this.state.builds.find(record => record.id === id);
    if (!build) {
      return;
    }

    build.status = status;
    build.endTime = new Date();
    build.duration = build.endTime.getTime() - build.startTime.getTime();
    build.error = error;
  }

  registerModule(name: string, version: string, routeCount: number): void {
    this.state.activeModules.set(name, {
      name,
      version,
      loadedAt: new Date(),
      routeCount,
      status: 'active'
    });
  }

  unregisterModule(name: string): void {
    this.state.activeModules.delete(name);
  }

  snapshot(): MonitoringSnapshot {
    return {
      builds: this.state.builds.map(build => ({
        id: build.id,
        moduleName: build.moduleName,
        modulePath: build.modulePath,
        status: build.status,
        startTime: build.startTime.toISOString(),
        endTime: build.endTime?.toISOString(),
        duration: build.duration,
        error: build.error
      })),
      modules: Array.from(this.state.activeModules.values(), module => this.snapshotModule(module)),
      stats: this.getStats(),
      generatedAt: new Date().toISOString()
    };
  }

  private snapshotModule(module: ActiveModule) {
    return {
      name: module.name,
      version: module.version,
      loadedAt: module.loadedAt.toISOString(),
      routeCount: module.routeCount,
      status: module.status
    };
  }

  private getStats(): MonitoringStats {
    const builds = this.state.builds;
    return {
      totalBuilds: builds.length,
      successfulBuilds: builds.filter(build => build.status === 'success').length,
      failedBuilds: builds.filter(build => build.status === 'error').length,
      buildingNow: builds.filter(build => build.status === 'building').length,
      activeModules: this.state.activeModules.size,
      uptime: Date.now() - this.state.startTime.getTime()
    };
  }
}
