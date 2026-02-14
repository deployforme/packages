import { Kernel, createRuntimeContext, RuntimeModule } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

// Create test modules
function createTestModule(name: string, routeCount: number): string {
  const routes = Array.from({ length: routeCount }, (_, i) => `
    context.http.registerRoute({
      id: '${name}-route-${i}',
      method: 'GET',
      path: '/${name}/route-${i}',
      handler: async () => ({ data: 'response-${i}' })
    });
  `).join('\n');

  const content = `
module.exports = {
  name: '${name}',
  version: '1.0.0',
  register(context) {
    ${routes}
  },
  dispose() {}
};
  `;

  const modulePath = path.join(__dirname, 'temp', `${name}.module.js`);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  fs.writeFileSync(modulePath, content);
  return modulePath;
}

async function benchmarkModuleLoad() {
  console.log('=== Module Load Performance Benchmark ===\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  const scenarios = [
    { name: 'Small Module', routes: 5 },
    { name: 'Medium Module', routes: 50 },
    { name: 'Large Module', routes: 200 },
    { name: 'XL Module', routes: 500 },
    { name: 'XXL Module', routes: 1000 }
  ];

  for (const scenario of scenarios) {
    const modulePath = createTestModule(`test-${scenario.routes}`, scenario.routes);
    
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await kernel.load(modulePath);
      const end = process.hrtime.bigint();
      
      times.push(Number(end - start) / 1_000_000); // Convert to ms
      
      await kernel.unload(`test-${scenario.routes}`);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    const p99 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.99)];

    console.log(`${scenario.name} (${scenario.routes} routes):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);
    console.log(`  P95: ${p95.toFixed(2)}ms`);
    console.log(`  P99: ${p99.toFixed(2)}ms`);
    console.log(`  Throughput: ${(1000 / avg).toFixed(2)} loads/sec\n`);
  }

  // Cleanup
  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

benchmarkModuleLoad().catch(console.error);
