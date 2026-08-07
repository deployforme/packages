# Hivelet

**Safe runtime module management for modern Node.js applications.**

Hivelet is a small runtime layer that lets a Node.js application swap HTTP routes,
services, or whole feature modules **without crashing, without losing state, and without
dropping a single request**.

## Why Hivelet?

| Problem                                                | How Hivelet solves it                                        |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Restarting the process to change one route's code       | Sub-second hot reload — or no call at all in autonomous mode  |
| Requests dropped while the old module is torn down      | Atomic route swap with automatic rollback on failure          |
| State shared between modules disappears on reload       | Dependency container plus `dispose()` hooks                   |
| No idea which modules are healthy after a reload        | Built-in monitoring dashboard and structured logs             |
| A bad deploy needs a full redeploy to undo              | On-disk version history and one-call `rollback()`             |

## Three guarantees

1. **Modules are isolated.** Each module owns its routes, its state, and its cleanup.
2. **The kernel serializes everything.** Two concurrent `load()` calls queue instead of
   racing each other.
3. **Failure is contained.** If a reload fails, the previous module stays in place — the
   system is never left without a module.

## First look

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
const adapter = new ExpressAdapter(app);

const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: { enabled: true, paths: ['./dist/modules'] }
});

await kernel.start();
app.listen(3000);
```

That is the whole setup. `start()` discovers every module under `./dist/modules`, loads
them, and keeps watching the directory. Edit `users.module.js` and save — the kernel
reloads it, swaps the routes atomically, and records a new revision. No restart, no
reload endpoint, no `nodemon`.

If you prefer explicit control, autonomous mode is opt-in; `kernel.load(path)` and
`kernel.reload(path)` still work exactly as before.

## Packages

| Package                       | Role                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| `@hivelet/core`               | Kernel, registry, loader, runtime context, logging, monitoring    |
| `@hivelet/adapter-express`    | Route register/unregister on top of Express                       |
| `@hivelet/adapter-nest`       | Adapter for NestJS (Express platform)                             |
| `@hivelet/taskboard` *(demo)* | Reference application — a real task management API                |

## When should you use Hivelet?

- Your application is made of several feature modules and you want to develop them in
  isolation.
- You want an edit-save-see-it-live loop in development without losing in-memory state.
- You need to ship or withdraw a single feature in production without a full restart.
- You want a recorded history of what code was running, and the ability to roll back.

## When should you not?

- The change touches bootstrap code, framework middleware, or native dependencies. Those
  still need a restart.
- You need process-level isolation or a security boundary between modules. Modules share
  the host process; Hivelet is not a sandbox.

## Where to next

- [Getting started](getting-started.md) — install and run the first module.
- [Autonomy](concepts/autonomy.md) — remove the reload call entirely.
- [Logging](concepts/logging.md) — structured, level-aware logs with transports.
- [Versioning and rollback](tr/guides/zero-downtime.md) — history and undo.
- [Concepts](concepts/index.md) — how the kernel, modules, and adapters fit together.
