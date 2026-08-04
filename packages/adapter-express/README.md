# @hivelet/adapter-express

Express adapter for Hivelet. Maps `context.http.registerRoute` to a live Express `Router` so modules can be loaded, reloaded, and unloaded at runtime.

## Features

- Dynamic Express route registration and unregistration
- Per-adapter router swap for atomic reloads
- Body parsing stays with your Express middleware (`app.use(express.json())`, etc.)
- Typed `Request`/`Response` end-to-end

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

const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)));

await kernel.load('./modules/user.module.js');
await kernel.load('./modules/product.module.js');

app.listen(3000);
```

## Module example

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
      handler: async () => ({ users: ['Alice', 'Bob', 'Charlie'] })
    });

    context.http.registerRoute({
      id: 'user-create',
      method: 'POST',
      path: '/users',
      handler: async (req) => ({
        id: Date.now(),
        name: req.body?.name
      })
    });

    context.http.registerRoute({
      id: 'user-get',
      method: 'GET',
      path: '/users/:id',
      handler: async (req) => ({ id: req.params.id, name: 'User ' + req.params.id })
    });
  },
  dispose() {}
};
```

A handler's return value is sent as JSON. Throw to delegate to Express error middleware.

## Hot reload

```ts
await kernel.load('./modules/user.module.js');
// edit user.module.js ...
await kernel.reload('./modules/user.module.js');
```

The adapter rebuilds its internal router and swaps it in atomically — pending requests finish on the old router, new requests hit the new one.

## API

### `ExpressAdapter`

```ts
new ExpressAdapter(app: express.Application);

interface HttpAdapter {
  registerRoute(definition: RouteDefinition): void;
  unregisterRoute(id: string): void;
}
```

### `RouteDefinition`

```ts
interface RouteDefinition {
  readonly id: string;          // unique per module
  readonly method: HttpMethod;  // GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
  readonly path: string;        // absolute, must start with /
  readonly handler: (req, res) => unknown | Promise<unknown>;
}
```

## Middleware

Standard Express middleware is applied to the host app before the adapter:

```ts
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// modules run after the middleware chain
```

Error middleware works the same way:

```ts
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal Server Error' });
});
```

## License

MIT © Hacı Mert Gökhan
