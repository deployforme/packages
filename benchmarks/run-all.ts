import { execSync } from 'child_process';

const benchmarks = [
  { name: 'Module Load Performance', script: 'load-performance.ts' },
  { name: 'Hot Reload Performance', script: 'reload-performance.ts' },
  { name: 'Concurrent Reload', script: 'concurrent-reload.ts' },
  { name: 'Request Throughput', script: 'throughput.ts' },
  { name: 'Memory Leak Detection', script: 'memory-leak.ts' },
  { name: 'Stress Test', script: 'stress-test.ts' }
];

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║         Deploy4Me Performance Benchmark Suite             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

for (const benchmark of benchmarks) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${benchmark.name}`);
  console.log('='.repeat(60) + '\n');

  try {
    execSync(`ts-node ${benchmark.script}`, {
      stdio: 'inherit',
      cwd: __dirname
    });
  } catch (error) {
    console.error(`\n❌ ${benchmark.name} failed\n`);
  }
}

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║              Benchmark Suite Complete                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');
