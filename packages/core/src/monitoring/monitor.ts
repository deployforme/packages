import { BuildRecord, BuildStatus, ActiveModule, MonitoringState } from './types';

export class Monitor {
  private state: MonitoringState;
  private maxBuilds = 100;

  constructor() {
    this.state = {
      builds: [],
      activeModules: new Map(),
      startTime: new Date()
    };
  }

  startBuild(moduleName: string, modulePath: string): string {
    const id = `${moduleName}-${Date.now()}`;
    const record: BuildRecord = {
      id,
      moduleName,
      modulePath,
      status: 'building',
      startTime: new Date()
    };
    
    this.state.builds.unshift(record);
    if (this.state.builds.length > this.maxBuilds) {
      this.state.builds = this.state.builds.slice(0, this.maxBuilds);
    }
    
    return id;
  }

  completeBuild(id: string, status: 'success' | 'error', error?: string): void {
    const build = this.state.builds.find(b => b.id === id);
    if (build) {
      build.status = status;
      build.endTime = new Date();
      build.duration = build.endTime.getTime() - build.startTime.getTime();
      if (error) {
        build.error = error;
      }
    }
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

  getState(): MonitoringState {
    return {
      ...this.state,
      activeModules: new Map(this.state.activeModules)
    };
  }

  getBuilds(): BuildRecord[] {
    return [...this.state.builds];
  }

  getActiveModules(): ActiveModule[] {
    return Array.from(this.state.activeModules.values());
  }

  getStats() {
    const builds = this.state.builds;
    return {
      totalBuilds: builds.length,
      successfulBuilds: builds.filter(b => b.status === 'success').length,
      failedBuilds: builds.filter(b => b.status === 'error').length,
      buildingNow: builds.filter(b => b.status === 'building').length,
      activeModules: this.state.activeModules.size,
      uptime: Date.now() - this.state.startTime.getTime()
    };
  }
}
