import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import express from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

function createModule(name: string): string {
  const content = `
module.exports = {
  name: '${name}',
  version: '1.0.0',
  register(context) {
    context.http.registerRoute({
      id: '${name}-endpoint',
      method: 'GET',
      path: '/${name}',
      handler: async () => ({ 
        timestamp: Date.now(),
        data: 'x'.repeat(1000) // 1KB response
      })
    });
  }
};
  `;

  const modulePath = path.join(__dirname, 'temp', `${name}.module.js`);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  fs.writeFileSync(modulePath, content);
  return modulePath;
}

async function makeRequest(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(Date.now() - start));
    }).on('error', reject);
  });
}

async function benchmarkThroughput() {
  console.log('=== Request Throughput Benchmark ===\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  // Load 10 modules
  const moduleCount = 10;
  for (let i = 0; i < moduleCount; i++) {
    const modulePath = createModule(`module${i}`);
    await kernel.load(modulePath);
  }

  const server = app.listen(0);
  const port = (server.address() as any).port;

  console.log(`Loaded ${moduleCount} modules`);
  console.log('Testing request throughput...\n');

  // Sequential requests
  const sequentialCount = 1000;
  const sequentialStart = Date.now();
  for (let i = 0; i < sequentialCount; i++) {
    await makeRequest(port, `/module${i % moduleCount}`);
  }
  const sequentialTime = Date.now() - sequentialStart;
  const sequentialRps = (sequentialCount / sequentialTime) * 1000;

  console.log('Sequential Requests:');
  console.log(`  Total: ${sequentialCount}`);
  console.log(`  Time: ${sequentialTime}ms`);
  console.log(`  RPS: ${sequentialRps.toFixed(2)}`);
  console.log(`  Avg Latency: ${(sequentialTime / sequentialCount).toFixed(2)}ms\n`);

  // Concurrent requests
  const concurrentCount = 1000;
  const concurrency = 50;
  const batches = Math.ceil(concurrentCount / concurrency);
  
  const concurrentStart = Date.now();
  for (let batch = 0; batch < batches; batch++) {
    const promises = [];
    for (let i = 0; i < concurrency && (batch * concurrency + i) < concurrentCount; i++) {
      const moduleIndex = (batch * concurrency + i) % moduleCount;
      promises.push(makeRequest(port, `/module${moduleIndex}`));
    }
    await Promise.all(promises);
  }
  const concurrentTime = Date.now() - concurrentStart;
  const concurrentRps = (concurrentCount / concurrentTime) * 1000;

  console.log('Concurrent Requests (50 concurrent):');
  console.log(`  Total: ${concurrentCount}`);
  console.log(`  Time: ${concurrentTime}ms`);
  console.log(`  RPS: ${concurrentRps.toFixed(2)}`);
  console.log(`  Avg Latency: ${(concurrentTime / concurrentCount).toFixed(2)}ms\n`);

  server.close();
  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

benchmarkThroughput().catch(console.error);
