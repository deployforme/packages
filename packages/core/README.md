# @hivelet/core

Framework-agnostic kernel for runtime module management in Node.js. Load, reload, and unload CommonJS modules without restarting the host process.

## Features

- Hot-reload modules at runtime
- Exclusive operation queue (no torn writes across `load`/`reload`/`unload`)
- Cross-module route ownership checks
- Built-in monitoring dashboard (HTTP) and in-process snapshot
- Strict, framework-agnostic TypeScript types

## Install

```bash
pnpm add @hivelet/core
```

## Quick start

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)));

await kernel.load('./modules/user.module.js');
await kernel.reload('./modules/user.module.js'); // hot reload
await kernel.unload('user');

app.listen(3000);
```

## Module shape

```js
// user.module.js
module.exports = {
  name: 'user',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({
      id: 'user-list',
      method: 'GET',
      path: '/users',
      handler: async () => ({ users: ['Alice', 'Bob'] })
    });
  },
  dispose() {
    // cleanup
  }
};
```

`name` and `version` are required and must be non-empty. `register` is required; `dispose` is optional.

## API

### `Kernel`

```ts
new Kernel(context, config?);
```

| Method | Returns | Description |
|--------|---------|-------------|
| `start()` | `Promise<DashboardAddress \| undefined>` | Boots the monitoring HTTP server if enabled |
| `load(path)` | `Promise<ModuleMetadata>` | Load a module from disk |
| `reload(path)` | `Promise<ModuleMetadata>` | Reload a module by file path |
| `unload(name)` | `Promise<boolean>` | Unregister a module by name |
| `list()` | `readonly ModuleMetadata[]` | Currently active modules |
| `get(name)` | `ModuleMetadata \| undefined` | Single module by name |
| `status()` | `MonitoringSnapshot` | Builds, active modules, and stats |
| `stop()` | `Promise<void>` | Unload everything and stop the dashboard |

All mutating operations (`load`, `reload`, `unload`, `stop`) run through a single exclusive queue.

### `createRuntimeContext`

```ts
createRuntimeContext(http, options?);
```

Returns a frozen `RuntimeContext` with `http`, optional `container`, and an optional `logger` (defaults to `DefaultLogger`).

### Module metadata

```ts
interface ModuleMetadata {
  readonly module: RuntimeModule;   // module.version lives here
  readonly registeredRoutes: readonly RouteDefinition[];
  readonly loadedAt: Date;
}
```

Use `m.module.version` to read the module's version.

## Configuration

```ts
new Kernel(context, {
  dashboard: {
    enabled: true,
    host: '127.0.0.1',
    port: 5000,
    refreshInterval: 3000 // ms, 500..60000
  },
  buildHistoryLimit: 100 // 1..1000
});
```

The dashboard only binds when `enabled: true`. `port: 0` lets the OS pick a free port.

## Monitoring

```ts
await kernel.start();
const snapshot = kernel.status();
```

`kernel.status()` returns a `MonitoringSnapshot` with:

- `builds` — recent build records (id, moduleName, modulePath, status, duration, error)
- `modules` — currently active modules (name, version, routeCount, status, loadedAt)
- `stats` — totals (totalBuilds, successfulBuilds, failedBuilds, buildingNow, activeModules, uptime)
- `generatedAt` — ISO timestamp

The HTTP dashboard serves the same data:

- `GET /api/state` — JSON snapshot
- `GET /health` — liveness probe
- `GET /` — built-in dark UI

## Adapters

Use an official adapter to wire the kernel into a framework:

- [@hivelet/adapter-express](https://www.npmjs.com/package/@hivelet/adapter-express) — Express.js
- [@hivelet/adapter-nest](https://www.npmjs.com/package/@hivelet/adapter-nest) — NestJS (platform-express)

## License

MIT © Hacı Mert Gökhan
