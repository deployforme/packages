import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import express from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

function createModule(name: string, version: number): string {
  const content = `
module.exports = {
  name: '${name}',
  version: '${version}.0.0',
  register(context) {
    for (let i = 0; i < 20; i++) {
      context.http.registerRoute({
        id: '${name}-route-' + i,
        method: 'GET',
        path: '/${name}/endpoint-' + i,
        handler: async () => ({ 
          module: '${name}',
          version: ${version},
          endpoint: i,
          timestamp: Date.now()
        })
      });
    }
  }
};
  `;

  const modulePath = path.join(__dirname, 'temp', `${name}.module.js`);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  fs.writeFileSync(modulePath, content);
  return modulePath;
}

async function makeRequest(port: number, path: string): Promise<boolean> {
  return new Promise((resolve) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(res.statusCode === 200));
    }).on('error', () => resolve(false));
  });
}

async function stressTest() {
  console.log('=== Extreme Stress Test ===\n');
  console.log('Scenario: High load + concurrent reloads + many modules\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  // Load 50 modules
  const moduleCount = 50;
  console.log(`Loading ${moduleCount} modules...`);
  for (let i = 0; i < moduleCount; i++) {
    const modulePath = createModule(`module${i}`, 1);
    await kernel.load(modulePath);
  }
  console.log(`✓ Loaded ${moduleCount} modules (${moduleCount * 20} routes)\n`);

  const server = app.listen(0);
  const port = (server.address() as any).port;

  // Stress test parameters
  const duration = 30000; // 30 seconds
  const requestsPerSecond = 1000;
  const reloadInterval = 500; // Reload every 500ms

  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let totalReloads = 0;
  let failedReloads = 0;

  console.log('Starting stress test...');
  console.log(`  Duration: ${duration / 1000}s`);
  console.log(`  Target RPS: ${requestsPerSecond}`);
  console.log(`  Reload Interval: ${reloadInterval}ms\n`);

  const startTime = Date.now();
  let running = true;

  // Request generator
  const requestInterval = setInterval(async () => {
    if (!running) return;

    const batch = 10;
    const promises = [];
    
    for (let i = 0; i < batch; i++) {
      const moduleIndex = Math.floor(Math.random() * moduleCount);
      const endpointIndex = Math.floor(Math.random() * 20);
      const path = `/module${moduleIndex}/endpoint-${endpointIndex}`;
      
      promises.push(
        makeRequest(port, path).then(success => {
          totalRequests++;
          if (success) successfulRequests++;
          else failedRequests++;
        })
      );
    }

    await Promise.all(promises);
  }, 1000 / (requestsPerSecond / 10));

  // Reload generator
  const reloadInterval_id = setInterval(async () => {
    if (!running) return;

    const moduleIndex = Math.floor(Math.random() * moduleCount);
    const moduleName = `module${moduleIndex}`;
    const newVersion = Math.floor(Math.random() * 1000);
    
    try {
      const modulePath = createModule(moduleName, newVersion);
      await kernel.reload(modulePath);
      totalReloads++;
    } catch (error) {
      failedReloads++;
    }
  }, reloadInterval);

  // Progress reporter
  const reportInterval = setInterval(() => {
    if (!running) return;

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const currentRps = (totalRequests / (Date.now() - startTime) * 1000).toFixed(0);
    
    console.log(`[${elapsed}s] Requests: ${totalRequests} (${currentRps} RPS) | Reloads: ${totalReloads} | Failures: ${failedRequests + failedReloads}`);
  }, 5000);

  // Stop after duration
  await new Promise(resolve => setTimeout(resolve, duration));
  running = false;

  clearInterval(requestInterval);
  clearInterval(reloadInterval_id);
  clearInterval(reportInterval);

  const totalTime = (Date.now() - startTime) / 1000;
  const actualRps = totalRequests / totalTime;
  const successRate = (successfulRequests / totalRequests * 100).toFixed(2);
  const reloadSuccessRate = ((totalReloads - failedReloads) / totalReloads * 100).toFixed(2);

  console.log('\n=== Stress Test Results ===\n');
  console.log('Requests:');
  console.log(`  Total: ${totalRequests}`);
  console.log(`  Successful: ${successfulRequests}`);
  console.log(`  Failed: ${failedRequests}`);
  console.log(`  Success Rate: ${successRate}%`);
  console.log(`  Actual RPS: ${actualRps.toFixed(2)}\n`);

  console.log('Reloads:');
  console.log(`  Total: ${totalReloads}`);
  console.log(`  Failed: ${failedReloads}`);
  console.log(`  Success Rate: ${reloadSuccessRate}%\n`);

  console.log('System Stability:');
  const isStable = failedRequests < totalRequests * 0.01 && failedReloads < totalReloads * 0.05;
  console.log(`  Status: ${isStable ? '✓ STABLE' : '⚠️  UNSTABLE'}`);
  console.log(`  Concurrent Operations: ${(totalRequests + totalReloads).toLocaleString()}`);

  server.close();
  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

stressTest().catch(console.error);
