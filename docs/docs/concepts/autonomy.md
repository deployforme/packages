# Autonomy

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

The watcher debounces editor save events, retries failed reloads, and leaves the current
module serving traffic when a new version cannot be activated. With `autoRollback`, the
last known good source is restored on disk after all retries fail.

Call `kernel.unwatch()` to stop file supervision while keeping loaded modules active.

## The version store

When versioning is enabled, every successful module load stores a source snapshot. The
history can be inspected with `kernel.history(name)` and restored with
`kernel.rollback(name)`. Failed loads never replace the active revision.
