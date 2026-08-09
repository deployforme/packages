# Configuration

Hivelet configuration has three layers:

1. **Kernel config** — the object passed to the constructor, validated at runtime.
2. **Environment variables** — read by your host application (except `HIVELET_LOG_LEVEL`,
   which the logger reads itself).
3. **Container registrations** — the DI services the host provides.

## Kernel config

```ts
interface KernelConfig {
  dashboard?: DashboardConfig;
  buildHistoryLimit?: number;
  autonomous?: AutonomousConfig;
  versioning?: VersioningConfig;
}

interface DashboardConfig {
  enabled?: boolean;        // default: false
  host?: string;            // default: '127.0.0.1'
  port?: number;            // default: 0 (ephemeral)
  refreshInterval?: number; // default: 3000 (ms)
}

interface AutonomousConfig {
  enabled?: boolean;        // default: false
  paths?: string[];         // required when enabled
  extensions?: string[];    // default: ['.js', '.cjs']
  entrySuffix?: string;     // default: '.module'
  ignore?: string[];        // default: [] (node_modules, .git, .hivelet always ignored)
  debounce?: number;        // default: 150 (ms)
  loadOnStart?: boolean;    // default: true
  unloadOnDelete?: boolean; // default: true
  retries?: number;         // default: 2
  retryDelay?: number;      // default: 500 (ms)
  autoRollback?: boolean;   // default: false
}

interface VersioningConfig {
  enabled?: boolean;        // default: true
  directory?: string;       // default: '.hivelet/versions'
  keep?: number;            // default: 20
}
```

### Defaults

```ts
const DEFAULT_CONFIG = {
  dashboard: {
    enabled: false,
    host: '127.0.0.1',
    port: 0,
    refreshInterval: 3000
  },
  buildHistoryLimit: 100,
  autonomous: {
    enabled: false,
    paths: [],
    extensions: ['.js', '.cjs'],
    entrySuffix: '.module',
    ignore: [],
    debounce: 150,
    loadOnStart: true,
    unloadOnDelete: true,
    retries: 2,
    retryDelay: 500,
    autoRollback: false
  },
  versioning: {
    enabled: true,
    directory: '.hivelet/versions',
    keep: 20
  }
};
```

### Validation rules

| Field                        | Rule                                    | Error        |
| ---------------------------- | --------------------------------------- | ------------ |
| `dashboard.enabled`          | boolean                                 | `TypeError`  |
| `dashboard.host`             | non-empty string                        | `TypeError`  |
| `dashboard.port`             | integer, 0 ≤ n ≤ 65535                  | `RangeError` |
| `dashboard.refreshInterval`  | integer, 500 ≤ n ≤ 60000                | `RangeError` |
| `buildHistoryLimit`          | integer, 1 ≤ n ≤ 1000                   | `RangeError` |
| `autonomous.enabled`         | boolean                                 | `TypeError`  |
| `autonomous.paths`           | array of non-empty strings; at least one when enabled | `TypeError` |
| `autonomous.extensions`      | array of non-empty strings (a leading `.` is added if missing) | `TypeError` |
| `autonomous.debounce`        | integer, 0 ≤ n ≤ 60000                  | `RangeError` |
| `autonomous.retries`         | integer, 0 ≤ n ≤ 10                     | `RangeError` |
| `autonomous.retryDelay`      | integer, 0 ≤ n ≤ 60000                  | `RangeError` |
| `versioning.directory`       | non-empty string                        | `TypeError`  |
| `versioning.keep`            | integer, 1 ≤ n ≤ 1000                   | `RangeError` |

Validation happens in `resolveKernelConfig()`. An invalid config makes `new Kernel(...)`
throw immediately, at startup, rather than at first reload.

### Frozen behaviour

The resolved config is `Object.freeze`d and cannot be mutated. The same is true of
`RuntimeContext` and `ModuleMetadata`.

## Environment variables

Hivelet reads exactly one variable itself:

| Variable            | Type   | Default | Meaning                                            |
| ------------------- | ------ | ------- | -------------------------------------------------- |
| `HIVELET_LOG_LEVEL` | string | `info`  | Default level for `createLogger()` / `DefaultLogger` |

Everything else is your host application's business:

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  dashboard: {
    enabled: process.env.DASHBOARD_ENABLED === '1',
    port: Number(process.env.DASHBOARD_PORT ?? 5000)
  },
  autonomous: {
    enabled: process.env.NODE_ENV !== 'production',
    paths: ['./dist/modules']
  }
});
```

Typical host variables:

| Variable            | Type    | Default | Meaning                     |
| ------------------- | ------- | ------- | --------------------------- |
| `PORT`              | number  | `3000`  | Main API port               |
| `DASHBOARD_PORT`    | number  | `5000`  | Dashboard port              |
| `DASHBOARD_ENABLED` | boolean | `false` | Is the dashboard on?        |

## Container registrations

```ts
const container = new SimpleContainer();
container.register('taskStore', new TaskStore());
container.register('logger', createHostLogger());
```

- Token: `string | symbol`.
- Service: any value, usually a class instance.
- Registering the same token twice throws.
- Modules **cannot register**; they may only `get()`.

Details: [Guides → Dependency injection](../tr/guides/dependency-injection.md).

## Next

- [Autonomy](autonomy.md) — what the autonomous options actually do
- [API → Core](../tr/api/core.md) — `Kernel`, `createRuntimeContext`, types
