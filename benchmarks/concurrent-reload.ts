import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

function createModule(name: string, version: number): string {
  const content = `
module.exports = {
  name: '${name}',
  version: '${version}.0.0',
  register(context) {
    context.http.registerRoute({
      id: '${name}-route',
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

async function benchmarkConcurrentReload() {
  console.log('=== Concurrent Reload Benchmark ===\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  const moduleCount = 20;
  console.log(`Loading ${moduleCount} modules...\n`);

  // Load initial modules
  for (let i = 0; i < moduleCount; i++) {
    const modulePath = createModule(`module${i}`, 1);
    await kernel.load(modulePath);
  }

  // Test concurrent reloads
  const scenarios = [
    { name: '5 Concurrent', concurrent: 5 },
    { name: '10 Concurrent', concurrent: 10 },
    { name: '20 Concurrent', concurrent: 20 }
  ];

  for (const scenario of scenarios) {
    const iterations = 50;
    const times: number[] = [];

    for (let iter = 0; iter < iterations; iter++) {
      const promises = [];
      const start = process.hrtime.bigint();

      for (let i = 0; i < scenario.concurrent; i++) {
        const moduleIndex = i % moduleCount;
        const modulePath = createModule(`module${moduleIndex}`, iter + 2);
        promises.push(kernel.reload(modulePath));
      }

      await Promise.all(promises);
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1_000_000);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`${scenario.name} Reloads:`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms\n`);
  }

  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

benchmarkConcurrentReload().catch(console.error);
