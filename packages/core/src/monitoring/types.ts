export interface MonitoringConfig {
  liveRunnerActions: boolean;
  port?: number;
  host?: string;
}

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
