import { Kernel, createRuntimeContext } from '@deploy4me/core';
import { ExpressAdapter } from '@deploy4me/adapter-express';
import express from 'express';
import * as fs from 'fs';
import * as path from 'path';

function createModule(name: string, iteration: number): string {
  const content = `
const largeData = new Array(1000).fill('x'.repeat(1000)); // ~1MB

module.exports = {
  name: '${name}',
  version: '${iteration}.0.0',
  register(context) {
    context.http.registerRoute({
      id: '${name}-route',
      method: 'GET',
      path: '/${name}',
      handler: async () => ({ 
        iteration: ${iteration},
        dataSize: largeData.length 
      })
    });
  },
  dispose() {
    // Cleanup
  }
};
  `;

  const modulePath = path.join(__dirname, 'temp', `${name}.module.js`);
  fs.mkdirSync(path.dirname(modulePath), { recursive: true });
  fs.writeFileSync(modulePath, content);
  return modulePath;
}

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: (usage.rss / 1024 / 1024).toFixed(2),
    heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2),
    heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2),
    external: (usage.external / 1024 / 1024).toFixed(2)
  };
}

async function benchmarkMemoryLeak() {
  console.log('=== Memory Leak Detection Benchmark ===\n');
  console.log('Testing 1000 reload cycles with 1MB module data...\n');

  const app = express();
  const adapter = new ExpressAdapter(app);
  const kernel = new Kernel(createRuntimeContext(adapter));

  const moduleName = 'memory-test';
  const iterations = 1000;
  const samples: any[] = [];

  // Initial load
  let modulePath = createModule(moduleName, 0);
  await kernel.load(modulePath);

  const initialMemory = getMemoryUsage();
  console.log('Initial Memory:');
  console.log(`  RSS: ${initialMemory.rss} MB`);
  console.log(`  Heap Used: ${initialMemory.heapUsed} MB\n`);

  // Reload cycles
  for (let i = 1; i <= iterations; i++) {
    modulePath = createModule(moduleName, i);
    await kernel.reload(modulePath);

    if (i % 100 === 0) {
      global.gc && global.gc(); // Force GC if available
      const memory = getMemoryUsage();
      samples.push({
        iteration: i,
        ...memory
      });

      console.log(`After ${i} reloads:`);
      console.log(`  RSS: ${memory.rss} MB`);
      console.log(`  Heap Used: ${memory.heapUsed} MB`);
    }
  }

  const finalMemory = getMemoryUsage();
  console.log('\nFinal Memory:');
  console.log(`  RSS: ${finalMemory.rss} MB`);
  console.log(`  Heap Used: ${finalMemory.heapUsed} MB\n`);

  const memoryGrowth = parseFloat(finalMemory.heapUsed) - parseFloat(initialMemory.heapUsed);
  const growthPerReload = memoryGrowth / iterations;

  console.log('Memory Analysis:');
  console.log(`  Total Growth: ${memoryGrowth.toFixed(2)} MB`);
  console.log(`  Growth per Reload: ${(growthPerReload * 1024).toFixed(2)} KB`);
  console.log(`  Leak Rate: ${growthPerReload > 0.1 ? '⚠️  HIGH' : '✓ LOW'}`);

  if (memoryGrowth > 100) {
    console.log('\n⚠️  WARNING: Significant memory growth detected!');
    console.log('   This indicates potential memory leaks.');
  } else {
    console.log('\n✓ Memory usage is stable.');
  }

  // Cleanup
  fs.rmSync(path.join(__dirname, 'temp'), { recursive: true, force: true });
}

// Run with: node --expose-gc memory-leak.js
benchmarkMemoryLeak().catch(console.error);
