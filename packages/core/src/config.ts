import type { MonitoringSnapshot } from './monitoring/types';

export interface DashboardConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  refreshInterval?: number;
  /** File containing the salted SHA-512 verifier. The generated password is never stored. */
  authFile?: string;
  /** Authenticated browser session lifetime in milliseconds. Defaults to 12 hours. */
  sessionTtl?: number;
}

export interface AutonomousConfig {
  /** Turns the watch-and-reload supervisor on. Defaults to `false`. */
  enabled?: boolean;
  /** Directories (recursive) or files holding runtime modules. */
  paths?: string[];
  /** Extensions considered modules. Defaults to `.js` and `.cjs`. */
  extensions?: string[];
  /** Entry filename suffix before the extension. Defaults to `.module`. */
  entrySuffix?: string;
  /** Path fragments to skip, in addition to `node_modules`, `.git` and `.hivelet`. */
  ignore?: string[];
  /** Quiet period in milliseconds before a filesystem event triggers a reload. */
  debounce?: number;
  /** Load every discovered module during `start()`. Defaults to `true`. */
  loadOnStart?: boolean;
  /** Unload a module when its file is deleted. Defaults to `true`. */
  unloadOnDelete?: boolean;
  /** Retry attempts for a failed autonomous reload. Defaults to `2`. */
  retries?: number;
  /** Delay in milliseconds between retries. Defaults to `500`. */
  retryDelay?: number;
  /**
   * Restore the last known good source on disk when every retry fails.
   * Defaults to `false` because it rewrites the module file.
   */
  autoRollback?: boolean;
}

export interface VersioningConfig {
  /** Records a snapshot of every successfully loaded module. Defaults to `true`. */
  enabled?: boolean;
  /** Where snapshots and indexes live. Defaults to `.hivelet/versions`. */
  directory?: string;
  /** Revisions retained per module. Defaults to `20`. */
  keep?: number;
}

export interface LifecycleConfig {
  /** Maximum time to await old in-flight requests before cleanup continues in the background. */
  drainTimeout?: number;
  /** Maximum queued lifecycle operations before new work is rejected. */
  maxPendingOperations?: number;
}

export interface CapacityConfig {
  /** Maximum concurrently active runtime modules. */
  maxModules?: number;
  /** Maximum routes accepted from one runtime module. */
  maxRoutesPerModule?: number;
  /** Maximum routes across all active runtime modules. */
  maxTotalRoutes?: number;
}

export interface MonitoringExporter {
  export(snapshot: MonitoringSnapshot): void | Promise<void>;
}

export interface MonitoringConfig {
  /** Vendor-neutral sink for Prometheus, OpenTelemetry, StatsD, or custom pipelines. */
  exporter?: MonitoringExporter;
  /** Export cadence in milliseconds. Defaults to 10 seconds. */
  exportInterval?: number;
}

export interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
  autonomous?: AutonomousConfig;
  versioning?: VersioningConfig;
  lifecycle?: LifecycleConfig;
  capacity?: CapacityConfig;
  monitoring?: MonitoringConfig;
}

export interface ResolvedDashboardConfig {
  readonly enabled: boolean;
  readonly host: string;
  readonly port: number;
  readonly refreshInterval: number;
  readonly authFile: string;
  readonly sessionTtl: number;
}

export interface ResolvedAutonomousConfig {
  readonly enabled: boolean;
  readonly paths: readonly string[];
  readonly extensions: readonly string[];
  readonly entrySuffix: string;
  readonly ignore: readonly string[];
  readonly debounce: number;
  readonly loadOnStart: boolean;
  readonly unloadOnDelete: boolean;
  readonly retries: number;
  readonly retryDelay: number;
  readonly autoRollback: boolean;
}

export interface ResolvedVersioningConfig {
  readonly enabled: boolean;
  readonly directory: string;
  readonly keep: number;
}

export interface ResolvedLifecycleConfig {
  readonly drainTimeout: number;
  readonly maxPendingOperations: number;
}

export interface ResolvedCapacityConfig {
  readonly maxModules: number;
  readonly maxRoutesPerModule: number;
  readonly maxTotalRoutes: number;
}

export interface ResolvedMonitoringConfig {
  readonly exporter?: MonitoringExporter;
  readonly exportInterval: number;
}

export interface ResolvedKernelConfig {
  readonly dashboard: ResolvedDashboardConfig;
  readonly buildHistoryLimit: number;
  readonly autonomous: ResolvedAutonomousConfig;
  readonly versioning: ResolvedVersioningConfig;
  readonly lifecycle: ResolvedLifecycleConfig;
  readonly capacity: ResolvedCapacityConfig;
  readonly monitoring: ResolvedMonitoringConfig;
}

const DEFAULT_CONFIG: ResolvedKernelConfig = Object.freeze({
  dashboard: Object.freeze({
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    refreshInterval: 3000,
    authFile: '.hivelet/dashboard-auth.json',
    sessionTtl: 43_200_000
  }),
  buildHistoryLimit: 100,
  autonomous: Object.freeze({
    enabled: false,
    paths: Object.freeze([]) as readonly string[],
    extensions: Object.freeze(['.js', '.cjs']) as readonly string[],
    entrySuffix: '.module',
    ignore: Object.freeze([]) as readonly string[],
    debounce: 150,
    loadOnStart: true,
    unloadOnDelete: true,
    retries: 2,
    retryDelay: 500,
    autoRollback: false
  }),
  versioning: Object.freeze({
    enabled: true,
    directory: '.hivelet/versions',
    keep: 20
  }),
  lifecycle: Object.freeze({
    drainTimeout: 30_000,
    maxPendingOperations: 1000
  }),
  capacity: Object.freeze({
    maxModules: 1000,
    maxRoutesPerModule: 5000,
    maxTotalRoutes: 20_000
  }),
  monitoring: Object.freeze({
    exportInterval: 10_000
  })
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
  const authFile: string = (dashboard.authFile ?? DEFAULT_CONFIG.dashboard.authFile) as string;
  const sessionTtl: number = (dashboard.sessionTtl ?? DEFAULT_CONFIG.dashboard.sessionTtl) as number;
  const buildHistoryLimit: number = (config.buildHistoryLimit ?? DEFAULT_CONFIG.buildHistoryLimit) as number;

  if (typeof enabled !== 'boolean') {
    throw new TypeError('dashboard.enabled must be a boolean');
  }
  if (typeof host !== 'string' || host.trim().length === 0) {
    throw new TypeError('dashboard.host must be a non-empty string');
  }
  assertIntegerInRange(port, 0, 65535, 'dashboard.port');
  assertIntegerInRange(refreshInterval, 500, 60000, 'dashboard.refreshInterval');
  if (typeof authFile !== 'string' || authFile.trim().length === 0) {
    throw new TypeError('dashboard.authFile must be a non-empty string');
  }
  assertIntegerInRange(sessionTtl, 60_000, 604_800_000, 'dashboard.sessionTtl');
  assertIntegerInRange(buildHistoryLimit, 1, 1000, 'buildHistoryLimit');

  return Object.freeze({
    dashboard: Object.freeze({
      enabled,
      host: host.trim(),
      port,
      refreshInterval,
      authFile: authFile.trim(),
      sessionTtl
    }),
    buildHistoryLimit,
    autonomous: resolveAutonomousConfig(config.autonomous as AutonomousConfig | undefined),
    versioning: resolveVersioningConfig(config.versioning as VersioningConfig | undefined),
    lifecycle: resolveLifecycleConfig(config.lifecycle as LifecycleConfig | undefined),
    capacity: resolveCapacityConfig(config.capacity as CapacityConfig | undefined),
    monitoring: resolveMonitoringConfig(config.monitoring as MonitoringConfig | undefined)
  });
}

function resolveMonitoringConfig(config: MonitoringConfig | undefined): ResolvedMonitoringConfig {
  if (config !== undefined && !isRecord(config)) {
    throw new TypeError('monitoring must be an object');
  }
  const source: MonitoringConfig = config ?? {};
  const exportInterval = source.exportInterval ?? DEFAULT_CONFIG.monitoring.exportInterval;
  if (source.exporter !== undefined && typeof source.exporter.export !== 'function') {
    throw new TypeError('monitoring.exporter must implement export(snapshot)');
  }
  assertIntegerInRange(exportInterval, 1000, 60_000, 'monitoring.exportInterval');
  return Object.freeze({
    exportInterval,
    ...(source.exporter ? { exporter: source.exporter } : {})
  });
}

function resolveCapacityConfig(config: CapacityConfig | undefined): ResolvedCapacityConfig {
  if (config !== undefined && !isRecord(config)) {
    throw new TypeError('capacity must be an object');
  }
  const source: CapacityConfig = config ?? {};
  const maxModules = source.maxModules ?? DEFAULT_CONFIG.capacity.maxModules;
  const maxRoutesPerModule = source.maxRoutesPerModule ?? DEFAULT_CONFIG.capacity.maxRoutesPerModule;
  const maxTotalRoutes = source.maxTotalRoutes ?? DEFAULT_CONFIG.capacity.maxTotalRoutes;
  assertIntegerInRange(maxModules, 1, 100_000, 'capacity.maxModules');
  assertIntegerInRange(maxRoutesPerModule, 1, 100_000, 'capacity.maxRoutesPerModule');
  assertIntegerInRange(maxTotalRoutes, 1, 1_000_000, 'capacity.maxTotalRoutes');
  if (maxRoutesPerModule > maxTotalRoutes) {
    throw new RangeError('capacity.maxRoutesPerModule cannot exceed capacity.maxTotalRoutes');
  }
  return Object.freeze({ maxModules, maxRoutesPerModule, maxTotalRoutes });
}

function resolveLifecycleConfig(config: LifecycleConfig | undefined): ResolvedLifecycleConfig {
  if (config !== undefined && !isRecord(config)) {
    throw new TypeError('lifecycle must be an object');
  }

  const source: LifecycleConfig = config ?? {};
  const drainTimeout = source.drainTimeout ?? DEFAULT_CONFIG.lifecycle.drainTimeout;
  const maxPendingOperations = source.maxPendingOperations ?? DEFAULT_CONFIG.lifecycle.maxPendingOperations;
  assertIntegerInRange(drainTimeout, 0, 3_600_000, 'lifecycle.drainTimeout');
  assertIntegerInRange(maxPendingOperations, 1, 100_000, 'lifecycle.maxPendingOperations');
  return Object.freeze({ drainTimeout, maxPendingOperations });
}

function resolveAutonomousConfig(config: AutonomousConfig | undefined): ResolvedAutonomousConfig {
  if (config !== undefined && !isRecord(config)) {
    throw new TypeError('autonomous must be an object');
  }

  const source: AutonomousConfig = config ?? {};

  const defaults = DEFAULT_CONFIG.autonomous;
  const enabled = source.enabled ?? defaults.enabled;
  const paths = source.paths ?? [...defaults.paths];
  const extensions = source.extensions ?? [...defaults.extensions];
  const entrySuffix = source.entrySuffix ?? defaults.entrySuffix;
  const ignore = source.ignore ?? [...defaults.ignore];
  const debounce = source.debounce ?? defaults.debounce;
  const loadOnStart = source.loadOnStart ?? defaults.loadOnStart;
  const unloadOnDelete = source.unloadOnDelete ?? defaults.unloadOnDelete;
  const retries = source.retries ?? defaults.retries;
  const retryDelay = source.retryDelay ?? defaults.retryDelay;
  const autoRollback = source.autoRollback ?? defaults.autoRollback;

  assertBoolean(enabled, 'autonomous.enabled');
  assertBoolean(loadOnStart, 'autonomous.loadOnStart');
  assertBoolean(unloadOnDelete, 'autonomous.unloadOnDelete');
  assertBoolean(autoRollback, 'autonomous.autoRollback');
  assertStringArray(paths, 'autonomous.paths');
  assertStringArray(extensions, 'autonomous.extensions');
  if (typeof entrySuffix !== 'string') {
    throw new TypeError('autonomous.entrySuffix must be a string');
  }
  assertStringArray(ignore, 'autonomous.ignore');
  assertIntegerInRange(debounce, 0, 60000, 'autonomous.debounce');
  assertIntegerInRange(retries, 0, 10, 'autonomous.retries');
  assertIntegerInRange(retryDelay, 0, 60000, 'autonomous.retryDelay');

  if (enabled && paths.length === 0) {
    throw new TypeError('autonomous.paths must list at least one directory when autonomous mode is enabled');
  }

  return Object.freeze({
    enabled,
    paths: Object.freeze([...paths]),
    extensions: Object.freeze(extensions.map(value => (value.startsWith('.') ? value : `.${value}`))),
    entrySuffix,
    ignore: Object.freeze([...ignore]),
    debounce,
    loadOnStart,
    unloadOnDelete,
    retries,
    retryDelay,
    autoRollback
  });
}

function resolveVersioningConfig(config: VersioningConfig | undefined): ResolvedVersioningConfig {
  if (config !== undefined && !isRecord(config)) {
    throw new TypeError('versioning must be an object');
  }

  const source: VersioningConfig = config ?? {};

  const defaults = DEFAULT_CONFIG.versioning;
  const enabled = source.enabled ?? defaults.enabled;
  const directory = source.directory ?? defaults.directory;
  const keep = source.keep ?? defaults.keep;

  assertBoolean(enabled, 'versioning.enabled');
  if (typeof directory !== 'string' || directory.trim().length === 0) {
    throw new TypeError('versioning.directory must be a non-empty string');
  }
  assertIntegerInRange(keep, 1, 1000, 'versioning.keep');

  return Object.freeze({ enabled, directory: directory.trim(), keep });
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${name} must be a boolean`);
  }
}

function assertStringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    throw new TypeError(`${name} must be an array of non-empty strings`);
  }
}

function assertIntegerInRange(value: number, minimum: number, maximum: number, name: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
