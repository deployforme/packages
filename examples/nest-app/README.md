# nest-app — Hivelet + NestJS

NestJS example showing the `@hivelet/adapter-nest` adapter with a typed `HiveletRegistry` service that exposes the kernel to controllers.

Requires `@nestjs/platform-express`. Fastify is not supported.

## Entry points

| Pattern          | Entry point            | Port |
| ---------------- | ---------------------- | ---- |
| Basic boot       | `src/main.ts`          | 3000 |
| Monitoring boot  | `src/main-monitoring.ts` | 3000 |
| DI + custom logger | `src/main-with-di.ts`   | 3002 |
| Graceful shutdown  | `src/main-graceful.ts` | 3003 |

## Install & build

```bash
pnpm install
pnpm build

pnpm --filter @hivelet/nest-example dev              # basic
pnpm --filter @hivelet/nest-example dev:monitoring  # + dashboard on :5000
pnpm --filter @hivelet/nest-example dev:di          # + DI + JSON logger
pnpm --filter @hivelet/nest-example dev:graceful    # + SIGINT/SIGTERM handling
```

## Test

```bash
curl http://localhost:3000/admin/modules
curl http://localhost:3000/users
curl http://localhost:3000/users/123
curl -X POST http://localhost:3000/admin/reload/user
```

## Wiring

`hivelet.registry.ts` holds the kernel:

```ts
import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Kernel } from '@hivelet/core';

@Injectable()
export class HiveletRegistry {
  private kernel: Kernel<Request, Response> | undefined;

  set(kernel: Kernel<Request, Response>): void {
    this.kernel = kernel;
  }

  get(): Kernel<Request, Response> {
    if (!this.kernel) {
      throw new Error('Hivelet kernel is not initialized');
    }
    return this.kernel;
  }
}
```

`main.ts` creates the kernel and registers it:

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';
import { AppModule } from './app.module';
import { HiveletRegistry } from './hivelet.registry';
import * as path from 'node:path';

const app = await NestFactory.create(AppModule);
const registry = app.get(HiveletRegistry);

const kernel = new Kernel(createRuntimeContext(new NestExpressAdapter(app)));
registry.set(kernel);

await kernel.load(path.join(__dirname, 'modules', 'user.module.js'));
await app.listen(3000);
```

Controllers read the kernel through `HiveletRegistry` — no `any` casts in app code.

## DI + custom logger

`src/main-with-di.ts` shows how to pass a `DependencyContainer` and a `Logger` through `createRuntimeContext` while keeping the kernel accessible to Nest controllers via `HiveletRegistry`:

```ts
const container = new SimpleContainer();
container.register('database', database);

const kernel = new Kernel(
  createRuntimeContext(new NestExpressAdapter(app), { container, logger }),
  { dashboard: { enabled: true, host: '127.0.0.1', port: 5000 } }
);
registry.set(kernel);
```

The `orders` module consumes the registered database through `context.container.get('database')`.

## Graceful shutdown

`src/main-graceful.ts` wires `SIGINT`, `SIGTERM`, and `SIGBREAK` (Windows) to a single async shutdown that closes the Nest app and calls `kernel.stop()`:

```ts
const shutdown = async (signal) => {
  await Promise.all([app.close(), kernel.stop()]);
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
}
```
