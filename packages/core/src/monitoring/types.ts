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

export interface MonitoringState {
  builds: BuildRecord[];
  activeModules: Map<string, ActiveModule>;
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
}

export interface MonitoringSnapshot {
  builds: BuildSnapshot[];
  modules: ActiveModuleSnapshot[];
  stats: MonitoringStats;
  generatedAt: string;
}

export interface DashboardAddress {
  host: string;
  port: number;
  url: string;
}
