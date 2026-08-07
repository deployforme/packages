import { randomUUID } from 'node:crypto';
import type {
  ActiveModule,
  BuildRecord,
  MonitoringSnapshot,
  MonitoringState,
  MonitoringStats,
  EndpointMetric,
  EndpointSnapshot
} from './types';

export class Monitor {
  private readonly maxBuilds: number;
  private readonly state: MonitoringState;

  constructor(maxBuilds = 100) {
    this.maxBuilds = maxBuilds;
    this.state = {
      builds: [],
      activeModules: new Map(),
      endpoints: new Map(),
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

  registerModule(
    name: string,
    version: string,
    routes: readonly { id: string; method: string; path: string; version?: string }[] | number
  ): void {
    const definitions = typeof routes === 'number' ? [] : routes;
    for (const [key, endpoint] of this.state.endpoints) {
      if (endpoint.moduleName === name && !definitions.some(route => route.id === endpoint.id)) {
        this.state.endpoints.delete(key);
      }
    }
    for (const route of definitions) {
      const key = this.endpointKey(name, route.id);
      const current = this.state.endpoints.get(key);
      this.state.endpoints.set(key, current
        ? { ...current, method: route.method, path: route.path, version: route.version ?? version }
        : {
            id: route.id,
            moduleName: name,
            method: route.method,
            path: route.path,
            version: route.version ?? version,
            requests: 0,
            errors: 0,
            activeRequests: 0,
            totalDuration: 0,
            maxDuration: 0,
            durations: [],
            requestTimes: []
          });
    }
    this.state.activeModules.set(name, {
      name,
      version,
      loadedAt: new Date(),
      routeCount: typeof routes === 'number' ? routes : routes.length,
      status: 'active'
    });
  }

  unregisterModule(name: string): void {
    this.state.activeModules.delete(name);
    for (const [key, endpoint] of this.state.endpoints) {
      if (endpoint.moduleName === name) {
        this.state.endpoints.delete(key);
      }
    }
  }

  startRequest(moduleName: string, routeId: string): void {
    const endpoint = this.state.endpoints.get(this.endpointKey(moduleName, routeId));
    if (endpoint) {
      endpoint.activeRequests += 1;
    }
  }

  completeRequest(moduleName: string, routeId: string, duration: number, failed: boolean): void {
    const endpoint = this.state.endpoints.get(this.endpointKey(moduleName, routeId));
    if (!endpoint) {
      return;
    }

    const now = Date.now();
    endpoint.requests += 1;
    endpoint.errors += failed ? 1 : 0;
    endpoint.activeRequests = Math.max(0, endpoint.activeRequests - 1);
    endpoint.totalDuration += duration;
    endpoint.maxDuration = Math.max(endpoint.maxDuration, duration);
    endpoint.lastRequestAt = new Date(now);
    endpoint.durations.push(duration);
    endpoint.requestTimes.push(now);
    if (endpoint.durations.length > 200) endpoint.durations.shift();
    this.trimRequestTimes(endpoint, now);
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
      endpoints: Array.from(this.state.endpoints.values(), endpoint => this.snapshotEndpoint(endpoint)),
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
    const endpoints = Array.from(this.state.endpoints.values());
    const now = Date.now();
    endpoints.forEach(endpoint => this.trimRequestTimes(endpoint, now));
    const totalRequests = endpoints.reduce((total, endpoint) => total + endpoint.requests, 0);
    const totalErrors = endpoints.reduce((total, endpoint) => total + endpoint.errors, 0);
    const totalDuration = endpoints.reduce((total, endpoint) => total + endpoint.totalDuration, 0);
    return {
      totalBuilds: builds.length,
      successfulBuilds: builds.filter(build => build.status === 'success').length,
      failedBuilds: builds.filter(build => build.status === 'error').length,
      buildingNow: builds.filter(build => build.status === 'building').length,
      activeModules: this.state.activeModules.size,
      uptime: now - this.state.startTime.getTime(),
      totalRequests,
      requestsPerMinute: endpoints.reduce((total, endpoint) => total + endpoint.requestTimes.length, 0),
      averageResponseTime: totalRequests === 0 ? 0 : totalDuration / totalRequests,
      errorRate: totalRequests === 0 ? 0 : totalErrors / totalRequests
    };
  }

  private snapshotEndpoint(endpoint: EndpointMetric): EndpointSnapshot {
    this.trimRequestTimes(endpoint, Date.now());
    const durations = [...endpoint.durations].sort((left, right) => left - right);
    const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
    return {
      id: endpoint.id,
      moduleName: endpoint.moduleName,
      method: endpoint.method,
      path: endpoint.path,
      version: endpoint.version,
      requests: endpoint.requests,
      requestsPerMinute: endpoint.requestTimes.length,
      errors: endpoint.errors,
      errorRate: endpoint.requests === 0 ? 0 : endpoint.errors / endpoint.requests,
      activeRequests: endpoint.activeRequests,
      averageResponseTime: endpoint.requests === 0 ? 0 : endpoint.totalDuration / endpoint.requests,
      p95ResponseTime: durations[p95Index] ?? 0,
      maxResponseTime: endpoint.maxDuration,
      lastRequestAt: endpoint.lastRequestAt?.toISOString()
    };
  }

  private trimRequestTimes(endpoint: EndpointMetric, now: number): void {
    const cutoff = now - 60_000;
    while (endpoint.requestTimes[0] !== undefined && endpoint.requestTimes[0] < cutoff) {
      endpoint.requestTimes.shift();
    }
  }

  private endpointKey(moduleName: string, routeId: string): string {
    return `${moduleName}:${routeId}`;
  }
}
