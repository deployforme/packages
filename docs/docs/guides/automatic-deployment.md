# Automatic deployment

Hivelet can deploy a rebuilt runtime module as soon as its compiled file appears or
changes. No reload endpoint or process restart is required.

## Configure the watched output

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules'],
    debounce: 150,
    retries: 2,
    retryDelay: 500,
    unloadOnDelete: true,
    autoRollback: true
  }
});

await kernel.start();
```

The host can start before `dist/modules` exists. Hivelet supervises the closest existing
parent, follows the build directory as it is created, and automatically loads matching
`*.module.js` or `*.module.cjs` entries.

## Run the build separately

Configure TypeScript or your bundler to emit CommonJS runtime modules under the watched
directory, then run its normal watch command alongside the host:

```bash
pnpm tsc --watch
```

The flow is:

```text
source change -> compiler emits dist/modules/*.module.js
              -> Hivelet validates and stages the module
              -> routes switch atomically
              -> the previous generation drains and disposes
```

Hivelet does not invoke the compiler. It also does not upload or copy artifacts to remote
machines. For remote deployment, use your CI/CD, file synchronization, or artifact delivery
system to place completed files under a watched path on each host.

## Failure and deletion behavior

Filesystem events are debounced so Hivelet does not load a file halfway through a compiler
write. A failed build is retried according to `retries` and `retryDelay`. If validation,
registration, or activation still fails, the current generation keeps serving traffic.
With `autoRollback`, the last known good source snapshot is restored after retries are
exhausted.

Deleting a module entry unloads it when `unloadOnDelete` is `true`. Deleting an unrelated
file or creating a matching file outside the configured paths has no effect.

## Operational checklist

- Emit CommonJS `.module.js` or `.module.cjs` entries into a watched path.
- Publish build outputs atomically when your delivery tool supports it.
- Keep module `name` stable and increment `version` for observable releases.
- Implement `dispose()` for timers, subscriptions, sockets, and other owned resources.
- Monitor build records and module health through the dashboard or structured logs.

For all watcher options, see [Configuration](../concepts/configuration.md).
