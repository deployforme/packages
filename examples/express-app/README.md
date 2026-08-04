# express-app — Hivelet + Express

Express example covering the four main runtime patterns of `@hivelet/core`:

| Pattern          | Entry point            | Port |
| ---------------- | ---------------------- | ---- |
| Basic boot       | `src/index.ts`         | 3000 |
| Production boot  | `src/index-prod.ts`    | 3000 |
| Monitoring boot  | `src/index-monitoring.ts` | 3001 |
| Zero-downtime demo | `src/demo-zero-downtime.ts` | 3001 |
| DI + custom logger | `src/index-with-di.ts`   | 3002 |
| Graceful shutdown  | `src/index-graceful.ts` | 3003 |

All examples use `await kernel.start()` to bring the dashboard online before any module is loaded, and `kernel.stop()` (graceful) to unload modules and stop the dashboard.

## Install & build

```bash
pnpm install
pnpm build
```

## Run

```bash
pnpm --filter @hivelet/express-example dev              # basic
pnpm --filter @hivelet/express-example dev:monitoring  # + dashboard on :5000
pnpm --filter @hivelet/express-example dev:di          # + DI + JSON logger
pnpm --filter @hivelet/express-example dev:graceful    # + SIGINT/SIGTERM handling
pnpm --filter @hivelet/express-example demo            # zero-downtime walkthrough
```

## Modules

Runtime modules live in `src/modules/*.module.js`. The current set:

- `user.module.js` — `GET /users`, `GET /users/:id`
- `product.module.js` — `GET /products`, `POST /products`
- `list.module.js` — `GET /list`
- `orders.module.js` — `GET /orders`, `POST /orders`, `GET /orders/:id`, `DELETE /orders/:id` (uses the runtime container)

Modules are CommonJS files loaded by `ModuleLoader.load(modulePath)`. Reload with:

```bash
curl -X POST http://localhost:3001/admin/reload/user
```

## DI + custom logger

`src/index-with-di.ts` shows how to pass a `DependencyContainer` and a `Logger` through `createRuntimeContext`:

```ts
const container = new SimpleContainer();
container.register('database', database);

const logger = new JsonLogger('kernel');

const kernel = new Kernel(
  createRuntimeContext(adapter, { container, logger }),
  { dashboard: { enabled: true, host: '127.0.0.1', port: 5000 } }
);
```

Inside a module:

```js
register(context) {
  const db = context.container.get('database');
  // ...
}
```

## Graceful shutdown

`src/index-graceful.ts` wires `SIGINT`, `SIGTERM`, and `SIGBREAK` (Windows) to a single async shutdown that closes the HTTP server and calls `kernel.stop()`:

```ts
const shutdown = async (signal) => {
  await Promise.all([closeServer(), kernel.stop()]);
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
}
```

`kernel.stop()` unloads every registered module (awaiting their `dispose()` hooks) and stops the dashboard server.
