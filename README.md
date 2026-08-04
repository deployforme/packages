# Hivelet

<div align="center">

**Runtime module management for Node.js**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org)

*Zero-downtime hot reload • Framework agnostic • Production ready*

</div>

---

Hivelet loads, reloads, and unloads modules at runtime in a running Node.js process. No restarts, no rebuilds of the host app, no framework lock-in.

## Why Hivelet?

Traditional deploys restart the whole process. Hivelet replaces routes and module implementations in place while the host keeps serving traffic.

| Approach | Deploy time | Downtime | Rollback |
|----------|-------------|----------|----------|
| Traditional | 30-120s | yes | slow |
| Hivelet | single module | none | instant |

## Features

- Hot reload of CommonJS modules at runtime
- Exclusive operation queue — no torn writes
- Route ownership checks across modules
- Built-in monitoring dashboard (`/api/state`, `/health`, UI at `/`)
- Framework-agnostic core with Express and NestJS adapters
- Strict, zero-dependency TypeScript types

## Install

```bash
pnpm add @hivelet/core @hivelet/adapter-express
```

## Quick start

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
  }
};
```

```ts
// index.ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)));

await kernel.load('./user.module.js');

app.listen(3000);
```

Reload a module without restarting the process:

```bash
curl -X POST http://localhost:3000/admin/reload/user
```

## Monitoring dashboard

```ts
const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)), {
  dashboard: { enabled: true, host: '127.0.0.1', port: 5000 }
});

await kernel.start();

app.listen(3000);
```

`kernel.status()` returns the current snapshot of builds, active modules, and stats. The dashboard also exposes the same data at `http://127.0.0.1:5000/`.

## Packages

| Package | Description |
|---------|-------------|
| [@hivelet/core](./packages/core) | Framework-agnostic kernel |
| [@hivelet/adapter-express](./packages/adapter-express) | Express integration |
| [@hivelet/adapter-nest](./packages/adapter-nest) | NestJS (platform-express) integration |

## Architecture

```
┌─────────────────────────────────────┐
│  Host application (Express/Nest)    │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Adapter (Express / NestExpress)    │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Hivelet Kernel                     │
│  • Module registry                  │
│  • Exclusive operation queue        │
│  • Route ownership                  │
│  • Monitor + optional dashboard     │
└────────────────┬────────────────────┘
                 │
┌────────────────▼────────────────────┐
│  Runtime modules (.js)              │
└─────────────────────────────────────┘
```

## Examples

- [express-app](./examples/express-app) — Express with hot reload and dashboard
- [nest-app](./examples/nest-app) — NestJS (platform-express) with admin controller

## License

MIT © Hacı Mert Gökhan
