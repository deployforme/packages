# Modules

A **module** is an isolated unit of functionality loaded at runtime. Typically it is a set
of HTTP routes, a few service references, and an optional `dispose` hook.

## File layout

```
src/modules/
├── greet.module.js
├── users.module.js
└── orders.module.js
```

- Files are named `<module-name>.module.js`.
- They are CommonJS (`module.exports`); the loader uses `require()`.
- Build output (`dist/modules/`) is copied during the build step.

In autonomous mode the whole directory is watched, so this layout is also the unit of
discovery — dropping a new `.module.js` file in is enough to load it.

## The contract

```ts
interface RuntimeModule<Request = unknown, Response = unknown> {
  readonly name: string;                                     // unique, [a-z0-9-_]
  readonly version: string;                                  // semver
  register(context: RuntimeContext<Request, Response>): Awaitable<void>;
  dispose?(): Awaitable<void>;
}
```

```js
module.exports = {
  name: 'users',
  version: '1.0.0',

  register(context) {
    context.http.registerRoute({ /* ... */ });
  },

  dispose() {
    // close subscriptions, timers, open connections
  }
};
```

### Rules

- `name` and `version` are required and must be non-empty.
- `register` may be async; the kernel awaits it.
- `dispose` is optional, may be async, and is awaited.
- A module's own internal state (closure variables, for example) is **reset on hot
  reload**, because the file is dropped from `require.cache` and loaded again. State that
  must survive belongs in the container.

## Defining routes

```js
context.http.registerRoute({
  id: 'users-list',          // unique within the module
  method: 'GET',
  path: '/users',
  handler: async (req) => {
    return { users: [...] }; // automatically sent with res.json()
  }
});
```

| Field     | Type           | Notes                                                        |
| --------- | -------------- | ------------------------------------------------------------ |
| `id`      | `string`       | Unique. Registering the same `id` twice throws.              |
| `method`  | `HttpMethod`   | `GET \| POST \| PUT \| DELETE \| PATCH \| HEAD \| OPTIONS`   |
| `path`    | `string`       | Express-style path syntax (`/users/:id`). Must start with `/`. |
| `handler` | `RouteHandler` | `(req, res) => Awaitable<Result \| void>`                    |

### Handler return rules

```js
// 1) Return an object → sent with res.json()
handler: async () => ({ count: 3 });

// 2) Return nothing → you call res.status(...).json(...) yourself
handler: async (req, res) => {
  res.status(404).json({ error: 'not found' });
};

// 3) Side effect first, then return
handler: async (req, res) => {
  res.setHeader('X-Total', '42');
  return { items: [...] };
};
```

### Failure modes

If a handler throws, the error reaches the Express error middleware. The kernel does not
intercept it and the build record stays `success` — the module loaded fine, the fault is in
one request.

If `register()` throws — a route conflict, a malformed path, a syntax error in the file —
the build record is `error`, **the previous version keeps serving traffic**, and nothing is
swapped. In autonomous mode the failure is retried and then reported through the
`module:failed` event.

## Using the container

Modules get their services from the **container**. The host sets it up; modules only read
from it.

```js
register(context) {
  const store = context.container.get('userStore');
  const logger = context.logger;
  // ...
}
```

```ts
// host side (index.ts)
const container = new SimpleContainer();
container.register('userStore', new UserStore());
const kernel = new Kernel(createRuntimeContext(adapter, { container }));
```

Because the container lives in the host and not the module, its contents survive every
reload. Details: [Guides → Dependency injection](../tr/guides/dependency-injection.md).

## Disposable resources

Everything a module opens must be closed in `dispose()`:

```js
let unsubscribe = null;

module.exports = {
  name: 'demo',
  version: '1.0.0',

  register(context) {
    const bus = context.container.get('eventBus');
    unsubscribe = bus.subscribe(event => { /* ... */ });
  },

  dispose() {
    if (unsubscribe) unsubscribe();
  }
};
```

This is what stops the old module's event listeners from leaking across a hot reload. A
module that forgets it will accumulate one listener per reload.

## Multiple modules

Modules do not talk to each other directly. Communication happens two ways:

1. **Shared services through the container** (recommended).
2. **An event bus or store**, itself obtained from the context.

Pulling in another module with a direct `require()` is an anti-pattern: it weakens the
contract between modules and produces inconsistencies during hot reload, because the two
copies can be at different versions.

## Next

- [Adapters](adapters.md) — the Express and Nest adapters
- [Guides → Hot reload](../tr/guides/hot-reload.md) — a real reload walkthrough
- [Concepts → Autonomy](autonomy.md) — reloads without a reload call
