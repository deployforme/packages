import { Kernel, createRuntimeContext } from '@hivelet/core';
import { ExpressAdapter } from '@hivelet/adapter-express';
import express from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

function createModule(name: string, version: number): string {
  const content = `
module.exports = {
  name: '${name}',
  version: '${version}.0.0',
  register(context) {
    context.http.registerRoute({
      id: '${name}-main',
      method: 'GET',
      path: '/${name}',
      handler: async () => ({ version: ${version} })
    });
  }
};
  `;

  const modulePath = path.join(__dirname, 'temp', `${name}.module.js`);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  fs.writeFileSync(modulePath, content);
  return modulePath;
}

async function benchmarkReload(): Promise<void> {
  console.log('=== Hot Reload Performance Benchmark ===\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  const modulePath = createModule('test-reload', 1);
  await kernel.load(modulePath);

  const iterations = 1000;
  const times: number[] = [];

  console.log(`Running ${iterations} consecutive reloads...\n`);

  for (let i = 0; i < iterations; i++) {
    createModule('test-reload', i + 2);

    const start = process.hrtime.bigint();
    await kernel.reload(modulePath);
    const end = process.hrtime.bigint();

    times.push(Number(end - start) / 1_000_000);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  console.log('Reload Performance:');
  console.log(`  Total Reloads: ${iterations}`);
  console.log(`  Average: ${avg.toFixed(2)}ms`);
  console.log(`  Median: ${median.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log(`  P95: ${p95.toFixed(2)}ms`);
  console.log(`  P99: ${p99.toFixed(2)}ms`);
  console.log(`  Reloads/sec: ${(1000 / avg).toFixed(2)}`);

  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

benchmarkReload().catch(console.error);
