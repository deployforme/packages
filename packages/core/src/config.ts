export interface DashboardConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  refreshInterval?: number;
}

export interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
}

export interface ResolvedDashboardConfig {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly refreshInterval: number;
}

export interface ResolvedKernelConfig {
  readonly dashboard: ResolvedDashboardConfig;
  readonly buildHistoryLimit: number;
}

const DEFAULT_CONFIG: ResolvedKernelConfig = Object.freeze({
  dashboard: Object.freeze({
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    refreshInterval: 3000
  }),
  buildHistoryLimit: 100
});

export function resolveKernelConfig(config: KernelConfig = {}): ResolvedKernelConfig {
  if (!isRecord(config)) {
    throw new TypeError('Kernel config must be an object');
  }

  const dashboard = config.dashboard ?? {};
  if (!isRecord(dashboard)) {
    throw new TypeError('dashboard must be an object');
  }

  const enabled: boolean = (dashboard.enabled ?? DEFAULT_CONFIG.dashboard.enabled) as boolean;
  const host: string = (dashboard.host ?? DEFAULT_CONFIG.dashboard.host) as string;
  const port: number = (dashboard.port ?? DEFAULT_CONFIG.dashboard.port) as number;
  const refreshInterval: number = (dashboard.refreshInterval ?? DEFAULT_CONFIG.dashboard.refreshInterval) as number;
  const buildHistoryLimit: number = (config.buildHistoryLimit ?? DEFAULT_CONFIG.buildHistoryLimit) as number;

  if (typeof enabled !== 'boolean') {
    throw new TypeError('dashboard.enabled must be a boolean');
  }
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw new TypeError('dashboard.host must be a non-empty string');
  }
  assertIntegerInRange(port, 0, 65535, 'dashboard.port');
  assertIntegerInRange(refreshInterval, 500, 60000, 'dashboard.refreshInterval');
  assertIntegerInRange(buildHistoryLimit, 1, 1000, 'buildHistoryLimit');

  return Object.freeze({
    dashboard: Object.freeze({
      enabled,
      host: host.trim(),
      port,
      refreshInterval
    }),
    buildHistoryLimit
  });
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
