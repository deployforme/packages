# @hivelet/core

Framework-agnostic runtime kernel for Node.js. Load, update, and remove HTTP modules without restarting the host process or interrupting unrelated endpoints.

## Features

- Hot-reload modules at runtime
- Endpoint-level route diffing keeps unchanged routes mounted during reloads
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

For new modules, prefer the decorator API over direct route registration:

```ts
import { Body, Controller, Get, Param, Post, Status, Version, defineModule } from '@hivelet/core';

@Controller('/users')
class UsersController {
  @Get('/:id')
  @Version('1.1.0')
  find(@Param('id') id: string) {
    return { id };
  }

  @Post()
  @Status(201)
  create(@Body() input: { name: string }) {
    return input;
  }
}

export default defineModule({
  name: 'users',
  version: '1.0.0',
  controllers: () => new UsersController()
});
```

Available decorators include `@Controller`, HTTP method decorators, `@Body`, `@Param`, `@Status`, `@OnError`, and `@Version`. Endpoint versions inherit the module version unless overridden.

## Low-level module shape

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

Reloads are applied per endpoint. Routes whose `id`, method, path, and success status stay
the same keep their mounted proxy and switch to the new handler atomically. New or structurally
changed routes are registered before deleted routes are removed, so updating one endpoint does
not unmount sibling endpoints.

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
    refreshInterval: 3000, // ms, 500..60000
    authFile: '.hivelet/dashboard-auth.json',
    sessionTtl: 43200000 // 12 hours
  },
  buildHistoryLimit: 100 // 1..1000
});
```

The dashboard only binds when `enabled: true`. `port: 0` lets the OS pick a free port.
On first start Hivelet generates a strong password and prints it once through the kernel
logger as `Dashboard password (shown once): ...`. Only a random-salt SHA-512 verifier is
persisted in `authFile`; removing that file before startup rotates the password.

## Autonomous mode

```ts
new Kernel(context, {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules'],
    loadOnStart: true,
    unloadOnDelete: true,
    retries: 2,
    retryDelay: 500,
    autoRollback: false
  }
});
```

Paths may point to module files or directories. Directories are discovered recursively and watched for changes. `autoRollback` is disabled by default because enabling it allows Hivelet to restore the last known good module source on disk after all reload retries fail.

## Monitoring

```ts
await kernel.start();
const snapshot = kernel.status();
```

`kernel.status()` returns a `MonitoringSnapshot` with:

- `builds` — recent build records (id, moduleName, modulePath, status, duration, error)
- `modules` — currently active modules (name, version, routeCount, status, loadedAt)
- `endpoints` — per-route request volume, active requests, errors, and average/P95/max latency
- `stats` — build, module, request-per-minute, error-rate, and response-time totals
- `generatedAt` — ISO timestamp

The HTTP dashboard serves the same data:

- `GET /api/state` — authenticated JSON snapshot
- `GET /health` — liveness probe
- `GET /` — authenticated full-screen draggable flow UI
- `POST /api/login` / `POST /api/logout` — dashboard session lifecycle

## Adapters

Use an official adapter to wire the kernel into a framework:

- [@hivelet/adapter-express](https://www.npmjs.com/package/@hivelet/adapter-express) — Express.js
- [@hivelet/adapter-nest](https://www.npmjs.com/package/@hivelet/adapter-nest) — NestJS (platform-express)

## License

MIT © Hacı Mert Gökhan
