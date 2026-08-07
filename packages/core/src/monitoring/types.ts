export type BuildStatus = 'building' | 'success' | 'error';

export interface BuildRecord {
  id: string;
  moduleName: string;
  modulePath: string;
  status: BuildStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
}

export interface ActiveModule {
  name: string;
  version: string;
  loadedAt: Date;
  routeCount: number;
  status: 'active' | 'error';
}

export interface EndpointMetric {
  id: string;
  moduleName: string;
  method: string;
  path: string;
  version: string;
  requests: number;
  errors: number;
  activeRequests: number;
  totalDuration: number;
  maxDuration: number;
  durations: number[];
  requestTimes: number[];
  lastRequestAt?: Date;
}

export interface MonitoringState {
  builds: BuildRecord[];
  activeModules: Map<string, ActiveModule>;
  endpoints: Map<string, EndpointMetric>;
  startTime: Date;
}

export interface BuildSnapshot extends Omit<BuildRecord, 'startTime' | 'endTime'> {
  startTime: string;
  endTime?: string;
}

export interface ActiveModuleSnapshot extends Omit<ActiveModule, 'loadedAt'> {
  loadedAt: string;
}

export interface MonitoringStats {
  totalBuilds: number;
  successfulBuilds: number;
  failedBuilds: number;
  buildingNow: number;
  activeModules: number;
  uptime: number;
  totalRequests: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  errorRate: number;
}

export interface EndpointSnapshot {
  id: string;
  moduleName: string;
  method: string;
  path: string;
  version: string;
  requests: number;
  requestsPerMinute: number;
  errors: number;
  errorRate: number;
  activeRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  maxResponseTime: number;
  lastRequestAt?: string;
}

export interface MonitoringSnapshot {
  builds: BuildSnapshot[];
  modules: ActiveModuleSnapshot[];
  endpoints: EndpointSnapshot[];
  stats: MonitoringStats;
  generatedAt: string;
}

export interface DashboardAddress {
  host: string;
  port: number;
  url: string;
}
