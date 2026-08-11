# Getting started

This guide builds a working Hivelet application from scratch. It takes about five minutes.

## 1. Install

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add @hivelet/core @hivelet/adapter-express express
pnpm add -D typescript @types/express @types/node ts-node
```

## 2. Your first module

`modules/greet.module.js`:

```js
module.exports = {
  name: 'greet',
  version: '1.0.0',

  register(context) {
    context.logger.info('module loaded', { module: 'greet' });

    context.http.registerRoute({
      id: 'greet-hello',
      method: 'GET',
      path: '/hello/:name',
      handler: async (req) => ({
        message: `Hello, ${req.params.name}!`,
        time: new Date().toISOString()
      })
    });
  },

  dispose() {
    // Release timers, sockets, and subscriptions here. Called before the next
    // version of this module takes over, and on unload.
  }
};
```

A module is a plain object with a `name`, a `version`, and a `register` function. It never
imports the kernel — everything it needs arrives through `context`.

## 3. The host

`index.ts`:

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

async function main(): Promise<void> {
  const app = express();
  const adapter = new ExpressAdapter(app);

  const kernel = new Kernel(createRuntimeContext(adapter), {
    dashboard: { enabled: true, host: '127.0.0.1', port: 5000 },
    autonomous: { enabled: true, paths: ['./modules'] }
  });

  // Discovers and loads every module under ./modules, then keeps watching them.
  await kernel.start();

  app.listen(3000, () => {
    console.log('API:       http://localhost:3000');
    console.log('Dashboard: http://127.0.0.1:5000/');
  });
}

main();
```

## 4. Run it

```bash
pnpm ts-node index.ts
```

```bash
curl http://localhost:3000/hello/world
# → {"message":"Hello, world!","time":"..."}
```

## 5. See the reload happen

Open `modules/greet.module.js` and change the version:

```js
version: '1.0.0'   // ← change to '1.0.1'
```

Save the file. That's it — nothing else to run. The kernel notices the change, loads the
new version, swaps the routes atomically, and records a new revision. The dashboard at
`http://127.0.0.1:5000/` shows the new build with status `success`, and the logs show:

```
14:22:09.412 INFO  hivelet Module greet registered with 1 routes module=greet version=1.0.1 routes=1 revision=2
```

If you would rather trigger reloads yourself, leave `autonomous` off and call
`kernel.reload('./modules/greet.module.js')` from an admin route. Both styles are
supported; see [Autonomy](concepts/autonomy.md).

For TypeScript projects, configure `paths` as `['./dist/modules']` and edit files under
`src/modules`. Your compiler writes the CommonJS output and Hivelet deploys each completed
change automatically. The host may start before `dist/modules` exists; the first build is
still discovered. Hivelet does not run the compiler itself. See
[Automatic deployment](guides/automatic-deployment.md).

## 6. Undo a bad change

Every successful load is snapshotted. To go back one revision:

```ts
await kernel.rollback('greet');
```

The previous source is restored on disk and reloaded. See
[Versioning and rollback](tr/guides/zero-downtime.md).

## Next steps

- [Concepts → Modules](concepts/modules.md) — the full module contract
- [Concepts → Autonomy](concepts/autonomy.md) — how the supervisor works
- [Guides → Automatic deployment](guides/automatic-deployment.md) — connect build output to Hivelet
- [Concepts → Logging](concepts/logging.md) — levels, scopes, and transports
- [Guides → Dependency injection](tr/guides/dependency-injection.md) — sharing services
- [Examples → TaskBoard](tr/examples/taskboard.md) — a larger, real application
