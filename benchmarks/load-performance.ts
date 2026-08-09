import { Kernel } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

async function benchmarkModuleLoad(): Promise<void> {
  console.log('=== Module Load Performance Benchmark ===\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel({ http: adapter }, { versioning: { enabled: false } });

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

      times.push(Number(end - start) / 1_000_000);

      await kernel.unload(`test-${scenario.routes}`);
    }

    const sorted = [...times].sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];

    console.log(`${scenario.name} (${scenario.routes} routes):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);
    console.log(`  P95: ${p95.toFixed(2)}ms`);
    console.log(`  P99: ${p99.toFixed(2)}ms`);
    console.log(`  Throughput: ${(1000 / avg).toFixed(2)} loads/sec\n`);
  }

  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
  await kernel.stop();
}

benchmarkModuleLoad().catch(console.error);
