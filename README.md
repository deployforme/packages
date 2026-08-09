# Hivelet

<div align="center">

**Transactional runtime modules for modern Node.js applications**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

*Endpoint-isolated hot reload. Live telemetry. No process restart.*

</div>

Hivelet lets a running Node.js application load, update, and remove HTTP modules without restarting the host process. It works with Express and NestJS while keeping runtime modules independent from either framework.

## What Hivelet provides

- Endpoint-isolated hot reload: changing one handler does not unmount sibling routes
- Atomic activation and rollback when a module update fails
- Automatic file watching for one module, many files, or entire directories
- Decorator-based HTTP modules with explicit input, status, error, and version metadata
- A protected flow dashboard with request volume, error rate, and latency telemetry
- Express, NestJS, and Hono adapters with transactional route batches

## Packages

| Package | Purpose |
| --- | --- |
| [`@hivelet/core`](./packages/core) | Runtime kernel, decorators, monitoring, and version snapshots |
| [`@hivelet/adapter-express`](./packages/adapter-express) | Dynamic route integration for Express |
| [`@hivelet/adapter-nest`](./packages/adapter-nest) | NestJS bootstrap, dependency injection, lifecycle, and logging |
| [`@hivelet/adapter-hono`](./packages/adapter-hono) | Immutable dispatcher swaps for Hono on Node.js |

## Install

For Express:

```bash
pnpm add @hivelet/core @hivelet/adapter-express express
```

For NestJS:

```bash
pnpm add @hivelet/core @hivelet/adapter-nest \
  @nestjs/common @nestjs/core @nestjs/platform-express express
```

For Hono:

```bash
pnpm add @hivelet/core @hivelet/adapter-hono hono
```

## Define a runtime module

Runtime controllers receive domain values instead of framework request and response objects.

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Status,
  Version,
  defineModule,
  notFound
} from '@hivelet/core';

@Controller('/users')
class UsersController {
  @Get()
  list() {
    return [{ id: '1', name: 'Ada' }];
  }

  @Get('/:id')
  @Version('1.1.0')
  find(@Param('id') id: string) {
    return id === '1' ? { id, name: 'Ada' } : notFound('User not found');
  }

  @Post()
  @Status(201)
  create(@Body() input: { name: string }) {
    return { id: crypto.randomUUID(), ...input };
  }
}

export default defineModule({
  name: 'users',
  version: '1.0.0',
  controllers: () => new UsersController()
});
```

An endpoint inherits the module version unless it declares its own `@Version()` metadata.

## Run with NestJS

```ts
import 'reflect-metadata';
import { HiveletNestFactory } from '@hivelet/adapter-nest';
import * as path from 'node:path';
import { AppModule } from './app.module';

void HiveletNestFactory.start(AppModule, {
  port: 3000,
  modules: path.join(__dirname, 'modules'),
  kernel: {
    dashboard: { enabled: true, port: 3001 }
  }
});
```

`HiveletNestFactory` owns the Nest lifecycle, loads every runtime module in the configured path, watches for changes, and routes NestJS logs through Hivelet.

## Safe hot reload

Hivelet compares routes by `id`, method, path, and success status. If those fields stay the same, the mounted route proxy remains in place and switches to the new handler only after the module activates successfully. In-flight requests finish on the generation they started with, and the previous module is disposed only after those requests drain.

Batch-capable adapters commit all structural route changes at once. Revision metadata uses durable temporary files and atomic renames; a persistence failure rolls route activation back before the candidate is rejected.

Autonomous mode discovers `*.module.js` and `*.module.cjs` entry files by default. Local CommonJS dependency changes reload every owning entry module without treating helper files as standalone modules.

## Flow dashboard

Enable the dashboard through the kernel configuration:

```ts
dashboard: {
  enabled: true,
  host: '127.0.0.1',
  port: 3001
}
```

On first start, Hivelet prints a generated dashboard password once. The password is never written to disk; only a randomly salted SHA-512 verifier is stored in `.hivelet/dashboard-auth.json`.

The dashboard shows:

- Active modules, endpoint relationships, and versions
- Requests per minute and active requests
- Error rate and average, P95, and maximum response times
- A draggable, zoomable flow view with persisted node positions

## Example

The [`nest-todo`](./examples/nest-todo) example demonstrates multiple independent runtime modules, NestJS dependency injection, endpoint-isolated reload, rollback, version metadata, and the authenticated flow dashboard.

```bash
pnpm --filter @hivelet/nest-todo-example dev
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## License

MIT © Hacı Mert Gökhan
