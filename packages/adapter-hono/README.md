# @hivelet/adapter-hono

Hono integration for Hivelet runtime modules on Node.js 20+.

```ts
import { Hono } from 'hono';
import { HonoAdapter } from '@hivelet/adapter-hono';
import { Kernel, createRuntimeContext } from '@hivelet/core';

const app = new Hono();
const adapter = new HonoAdapter(app);
const kernel = new Kernel(createRuntimeContext(adapter));

await kernel.load('./dist/modules/users.module.js');
```

The adapter mounts one delegating middleware and atomically swaps immutable child dispatchers. Create it before the host handles its first request. Runtime handlers receive an augmented `HonoRequest` followed by the child Hono `Context`.

Host `env` bindings and the raw request are preserved. Values written to a parent context with `c.set()` are not copied into the child context; inject shared services through Hivelet's runtime container instead.
