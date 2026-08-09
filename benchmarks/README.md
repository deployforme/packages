# @hivelet/benchmarks

Performance suite for the Hivelet kernel and `@hivelet/adapter-express`.

## Scripts

| Command | What it measures |
|---------|------------------|
| `pnpm bench:load` | Module load latency across sizes (5-1000 routes) |
| `pnpm bench:reload` | 1000 hot-reload cycles, P95/P99 latency |
| `pnpm bench:concurrent` | Parallel reloads (5/10/20 concurrent) |
| `pnpm bench:throughput` | Sequential and concurrent RPS over loaded modules |
| `pnpm bench:memory` | 1000 reload cycles, RSS/heap deltas |
| `pnpm bench:stress` | 50 modules, ~1000 RPS, continuous reloads |
| `pnpm bench` | Runs all of the above in sequence |

## Targets

- Load P95 < 10ms for modules up to 200 routes
- Load average < 15ms for 500 routes and < 25ms for 1000 routes
- Reload P99 < 20ms
- Success rate > 99.9%
- Memory growth < 5KB per reload
- Throughput > 100 loads/sec

Load benchmarks disable version persistence and application logging so they isolate kernel and adapter route-commit cost. If a number drifts outside these bands, treat it as a regression and investigate before merging.

## Custom benchmark

```ts
import express from 'express';
import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';

const app = express();
const kernel = new Kernel(createRuntimeContext(new ExpressAdapter(app)));

const start = process.hrtime.bigint();
await kernel.load('./module.js');
const end = process.hrtime.bigint();

console.log(`load: ${Number(end - start) / 1_000_000}ms`);
```

## Memory benchmark

The memory benchmark benefits from an explicit GC pass between samples:

```bash
node --expose-gc -r ts-node/register memory-leak.ts
```

## CI

```yaml
- name: Benchmarks
  run: pnpm --filter @hivelet/benchmarks bench
```
