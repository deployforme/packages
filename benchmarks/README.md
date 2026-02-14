# Deploy4Me Benchmarks

Comprehensive performance testing suite for Deploy4Me.

## Available Benchmarks

### 1. Module Load Performance
Tests module loading across different sizes (5-1000 routes).

```bash
pnpm bench:load
```

**Measures:**
- Average load time
- P95/P99 latency
- Throughput (loads/sec)

### 2. Hot Reload Performance
Tests 1000 consecutive reload cycles.

```bash
pnpm bench:reload
```

**Measures:**
- Reload consistency
- Performance degradation over time
- Memory stability

### 3. Concurrent Reload
Tests parallel module reloads (5, 10, 20 concurrent).

```bash
pnpm bench:concurrent
```

**Measures:**
- Concurrent operation handling
- Race condition detection
- Scalability

### 4. Request Throughput
Tests HTTP request handling with loaded modules.

```bash
pnpm bench:throughput
```

**Measures:**
- Sequential vs concurrent RPS
- Latency under load
- Deploy4Me overhead

### 5. Stress Test
Extreme load test: 50 modules, 1000 RPS, continuous reloads.

```bash
pnpm bench:stress
```

**Measures:**
- System stability
- Success rate under pressure
- Failure modes

### 6. Memory Leak Detection
Tests 1000 reload cycles with 1MB module data.

```bash
pnpm bench:memory
```

**Measures:**
- Memory growth per reload
- Leak detection
- Long-running stability

## Running All Benchmarks

```bash
pnpm bench
```

This runs all benchmarks sequentially and generates a comprehensive report.

## Interpreting Results

### Good Performance Indicators
- ✅ Load time <10ms P99
- ✅ Success rate >99.9%
- ✅ Memory growth <5KB/reload
- ✅ Throughput >100 loads/sec

### Warning Signs
- ⚠️ Load time >50ms P99
- ⚠️ Success rate <99%
- ⚠️ Memory growth >100KB/reload
- ⚠️ Throughput <50 loads/sec

## Custom Benchmarks

Create custom benchmarks by following the pattern:

```typescript
import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';

async function myBenchmark() {
  // Setup
  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  // Test
  const start = process.hrtime.bigint();
  await kernel.load('./module.js');
  const end = process.hrtime.bigint();

  // Report
  console.log(`Time: ${Number(end - start) / 1_000_000}ms`);
}
```

## CI/CD Integration

Run benchmarks in CI to detect performance regressions:

```yaml
- name: Run Benchmarks
  run: pnpm --filter deploy4me-benchmarks bench
  
- name: Check Performance
  run: |
    # Fail if P99 > 20ms
    # Fail if success rate < 99%
```

## Contributing

When adding features, ensure benchmarks pass:

1. Run existing benchmarks
2. Add new benchmarks for new features
3. Document performance characteristics
4. Update PERFORMANCE.md with results
