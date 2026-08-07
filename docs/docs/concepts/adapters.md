# Adapters

An `HttpAdapter` translates framework-specific route management into Hivelet's
framework-neutral contract. The kernel only ever talks to the adapter; it knows nothing
about Express or Nest.

## The contract

```ts
interface HttpAdapter<Request = unknown, Response = unknown> {
  registerRoute(definition: RouteDefinition<Request, Response>): void;
  unregisterRoute(id: string): void;
}
```

Two methods. Anything that implements them can be a Hivelet adapter — not just Express.

## Express adapter

```ts
import express from 'express';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
app.use(express.json()); // optional; the adapter adds it too

const adapter = new ExpressAdapter(app);
```

The `ExpressAdapter` constructor:

- Creates its own `express.Router()` and mounts it with `app.use(...)`.
- Adds the `express.json()` middleware automatically, so POST/PUT/PATCH bodies parse.
- Never touches Express's internal `_router` fields.

### Route lifecycle

```
registerRoute(def)
  → the router is rebuilt with the new route included

unregisterRoute(id)
  → the route is dropped and the router is rebuilt
  → on failure the previous state is restored
```

Rebuilding the router rather than mutating its stack is what makes the swap atomic: the
old router keeps serving requests until the new one is fully constructed.

Details: [API → Express adapter](../tr/api/adapter-express.md).

## Nest adapter

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressAdapter } from '@hivelet/adapter-nest';

const app = await NestFactory.create(AppModule);
const adapter = new NestExpressAdapter(app);
```

### Platform constraint

`NestExpressAdapter` only works with `@nestjs/platform-express`. If you use
`NestFactory.create(AppModule, new FastifyAdapter())` the constructor throws a `TypeError`:

```
NestExpressAdapter requires @nestjs/platform-express.
Detected platform: fastify. Use a different Hivelet adapter or switch the Nest platform.
```

Hivelet has **no** Fastify support and none is planned; sharing the adapter through the
Express stack is more robust.

### Implementation strategy

Internally `NestExpressAdapter` uses the same Express `Router()` as `ExpressAdapter`.
Because Nest's HTTP server is already Express-based, it works on a **shared router**
instead of `app._router`. As a result:

- Nest decorators keep working normally.
- Hivelet module routes participate in the Nest middleware chain.
- Accidentally using Fastify fails fast, at startup.

## Writing your own adapter

If you use a different HTTP framework, implement `HttpAdapter`:

```ts
class MyAdapter implements HttpAdapter {
  registerRoute(def: RouteDefinition): void {
    // framework-specific registration
  }
  unregisterRoute(id: string): void {
    // framework-specific removal
  }
}
```

Both methods must be synchronous and should throw rather than half-apply a change — the
kernel relies on that to roll activation back cleanly. Everything else (kernel, autonomy,
versioning, monitoring, dashboard) stays framework-agnostic.

## Next

- [API → Express adapter](../tr/api/adapter-express.md) — full signatures
- [Examples → TaskBoard](../tr/examples/taskboard.md) — the Express adapter in real use
