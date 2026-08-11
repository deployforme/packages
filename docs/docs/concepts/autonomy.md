# Autonomy and automatic deployment

Autonomous mode discovers runtime modules, loads them during startup, and reloads them
when their files change. It is enabled explicitly so existing applications keep manual
control by default.

```ts
const kernel = new Kernel(createRuntimeContext(adapter), {
  autonomous: {
    enabled: true,
    paths: ['./dist/modules'],
    autoRollback: true
  }
});

await kernel.start();
```

`paths` should normally point at compiled CommonJS output, not TypeScript source. The
directory does not need to exist when `start()` runs: Hivelet watches the closest existing
parent and discovers the first matching build output when the compiler creates it.

Hivelet owns runtime activation, not compilation or artifact delivery. Keep your compiler
or bundler running separately in watch mode. In production, your build or delivery system
must place artifacts under a watched path on the same machine.

The watcher:

- discovers matching `*.module.js` and `*.module.cjs` files at startup and after creation;
- debounces partial and repeated filesystem events from compilers;
- retries failed loads before reporting an error;
- stages new routes and activates them atomically;
- keeps the current generation serving traffic if activation fails;
- unloads a module when its entry file is deleted and `unloadOnDelete` is enabled; and
- tracks local CommonJS dependencies so changing one reloads its owning module.

With `autoRollback`, the last known good source is restored on disk after all retries fail.
See [Automatic deployment](../guides/automatic-deployment.md) for a complete build-output
setup.

Call `kernel.unwatch()` to stop file supervision while keeping loaded modules active.

## The version store

When versioning is enabled, every successful module load stores a source snapshot. The
history can be inspected with `kernel.history(name)` and restored with
`kernel.rollback(name)`. Failed loads never replace the active revision.
