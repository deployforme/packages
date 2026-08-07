# @hivelet/adapter-express

Express integration for Hivelet runtime modules. It mounts one dynamic router in the host application and updates runtime routes transactionally.

## Install

```bash
pnpm add @hivelet/core @hivelet/adapter-express express
```

## Quick start

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
app.use(express.json());

const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)), {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules']
  }
});

await kernel.start();
app.listen(3000);
```

## Runtime module

```ts
import { Body, Controller, Get, Param, Post, Status, defineModule } from '@hivelet/core';

@Controller('/users')
class UsersController {
  @Get()
  list() {
    return [{ id: '1', name: 'Ada' }];
  }

  @Get('/:id')
  find(@Param('id') id: string) {
    return { id, name: `User ${id}` };
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

The adapter extracts decorated parameters from Express requests and serializes returned values as JSON. `@Status()` controls a successful response status; empty successful responses such as `204` are sent without a body. `HttpError` values are returned as `{ "error": "message" }` with their declared status.

## Reload guarantees

Routes with the same `id`, method, path, and success status keep their mounted proxy during reload. Hivelet switches the handler target only after the new module activates successfully, so unrelated endpoints and in-flight requests continue normally.

When a structural route change requires rebuilding the Express router, replacement is transactional. If the rebuild fails, the adapter restores the previous working definition.

## Middleware

Register host middleware before creating the adapter:

```ts
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const adapter = new ExpressAdapter(app);
```

Runtime routes pass through the same Express middleware chain.

## Low-level routes

Decorator modules compile to the framework-agnostic `RouteDefinition` contract. Modules may also register that contract directly when transport-level access is required:

```ts
context.http.registerRoute({
  id: 'users-raw',
  method: 'GET',
  path: '/users/raw',
  handler: async request => ({ query: request.query })
});
```

## License

MIT © Hacı Mert Gökhan
