# Kernel

`Kernel` is Hivelet's central class. It owns the module lifecycle, the filesystem
supervisor, version history, monitoring, and the dashboard.

## Lifecycle

```
new Kernel(context, config)   → no side effects
        │
        ▼
await kernel.start()           → starts the dashboard, then autonomous mode
        │
        ▼
await kernel.load(path)        → loads a module and registers its routes
await kernel.reload(path)      → hot-reloads the same module
await kernel.unload(name)      → tears a module down and calls its dispose hook
await kernel.rollback(name)    → restores an earlier recorded revision
        │
        ▼
await kernel.stop()            → unloads everything and stops the dashboard
```

### Constructor — no side effects

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  dashboard: { enabled: true, host: '127.0.0.1', port: 5000 },
  autonomous: { enabled: true, paths: ['./dist/modules'] }
});
```

This call opens no network port, reads no file, and writes no log. It validates the config
object and sets up in-memory state — nothing more.

### start — dashboard, then autonomy

```ts
const address = await kernel.start();
// → { host: '127.0.0.1', port: 5000, url: 'http://127.0.0.1:5000/' }
```

`start()` does two things, in order:

1. Starts the monitoring dashboard when `dashboard.enabled` is true, returning its address.
   Otherwise it returns `undefined`.
2. When `autonomous.enabled` is true, scans the configured paths, loads every module it
   finds, and begins watching for changes.

It is **idempotent**: calling it more than once returns the same dashboard instance and
does not start a second watcher.

### load — loads a module

```ts
const metadata = await kernel.load('./modules/users.module.js');
// → ModuleMetadata<Request, Response>
```

The steps:

1. A monitoring build record is opened with status `building`.
2. `ModuleLoader` clears the require cache entry and loads the file, then validates it.
3. Routes are collected through a **staging adapter** — nothing has touched the real HTTP
   stack yet.
4. Conflicts are checked: another module already owning the same route `id`, or the same
   `method` + `path`, is an error.
5. If a module with the same name is already loaded, its routes are unregistered and the
   new routes are activated **atomically**. If activation fails midway, every partial
   change is rolled back and the previous routes are restored.
6. The previous module's `dispose()` hook is awaited.
7. The source is snapshotted into the version store as a new revision.
8. The build record is closed as `success` or `error`.

### reload — hot reload

```ts
await kernel.reload('./modules/users.module.js');
```

`reload` is an alias for `load`: loading a module whose name already exists replaces it,
under the same atomic swap rules. In autonomous mode you rarely call this yourself.

### unload — tears a module down

```ts
const removed = await kernel.unload('users');
// → boolean
```

Routes are removed via `unregisterRoute(id)`, `dispose()` is awaited, and the module is
dropped from the registry and from monitoring.

### rollback — restore an earlier revision

```ts
await kernel.rollback('users');      // one revision back
await kernel.rollback('users', 3);   // to a specific revision
```

The stored snapshot is written back over the module's own file and reloaded, so relative
`require` calls inside it keep resolving. See
[Versioning and rollback](../tr/guides/zero-downtime.md).

### stop — releases everything

```ts
await kernel.stop();
```

`stop()` in order:

1. Stops the filesystem watcher.
2. Unloads every module.
3. Shuts the dashboard server down.
4. If any step fails it throws an `AggregateError`, having still cleaned up everything it
   could.

Wire it to signals:

```ts
process.on('SIGTERM', () => kernel.stop().then(() => process.exit(0)));
```

## Serialization

The kernel puts every `load` / `reload` / `unload` / `rollback` / `stop` call into an
**exclusive queue**. Two concurrent calls never interleave — the second starts only after
the first settles. That makes this safe:

```ts
Promise.all([
  kernel.reload('./a.module.js'),
  kernel.reload('./b.module.js')
]);
```

The same queue also covers reloads triggered by the filesystem watcher, so a burst of
saves is processed one at a time.

## Events

`Kernel` extends `EventEmitter`, which is how you observe autonomous activity:

| Event               | Payload                                    | Fired when                              |
| ------------------- | ------------------------------------------ | --------------------------------------- |
| `module:loaded`     | `ModuleMetadata`                           | A module is activated                   |
| `module:unloaded`   | `string` (module name)                     | A module is torn down                   |
| `module:failed`     | `{ modulePath, error }`                    | An autonomous reload exhausted retries  |
| `module:rolledBack` | `{ moduleName, revision }`                 | A rollback completed                    |
| `watch:event`       | `{ kind: 'add' \| 'change' \| 'remove', path }` | The watcher saw a filesystem change |
| `error`             | `unknown`                                  | An internal failure was reported        |

```ts
kernel.on('module:failed', ({ modulePath, error }) => {
  alerting.notify(`Reload failed for ${modulePath}`, error);
});
```

The kernel only emits `error` when a listener is attached, so an unhandled reload failure
can never take the host process down.

## Inspecting state

```ts
kernel.list()                // → readonly ModuleMetadata[]
kernel.get('users')          // → ModuleMetadata | undefined
kernel.status()              // → MonitoringSnapshot
kernel.autonomous            // → boolean, is the watcher running?
kernel.history('users')      // → readonly ModuleRevision[]
kernel.versioned()           // → readonly string[]
```

`status()` returns exactly the JSON the dashboard publishes:

```ts
{
  builds: BuildSnapshot[],
  modules: ActiveModuleSnapshot[],
  stats: {
    totalBuilds: number,
    successfulBuilds: number,
    failedBuilds: number,
    buildingNow: number,
    activeModules: number,
    uptime: number
  },
  generatedAt: string
}
```

## Types

```ts
class Kernel<Request = unknown, Response = unknown> extends EventEmitter {
  constructor(
    context: RuntimeContext<Request, Response>,
    config?: KernelConfig
  );

  start(): Promise<DashboardAddress | undefined>;
  load(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  reload(modulePath: string): Promise<ModuleMetadata<Request, Response>>;
  unload(moduleName: string): Promise<boolean>;
  rollback(moduleName: string, revision?: number): Promise<ModuleMetadata<Request, Response>>;
  stop(): Promise<void>;

  watch(): readonly string[];
  unwatch(): void;
  readonly autonomous: boolean;

  list(): readonly ModuleMetadata<Request, Response>[];
  get(moduleName: string): ModuleMetadata<Request, Response> | undefined;
  status(): MonitoringSnapshot;
  history(moduleName: string): readonly ModuleRevision[];
  versioned(): readonly string[];
}
```

## Next

- [Modules](modules.md) — the module contract in detail
- [Autonomy](autonomy.md) — the watcher and the version store
- [Monitoring](monitoring.md) — build records and snapshots
- [Configuration](configuration.md) — config validation
