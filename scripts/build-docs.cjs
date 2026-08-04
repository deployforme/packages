#!/usr/bin/env node
const { spawn } = require('node:child_process');
const path = require('node:path');

const cwd = path.join(path.resolve(__dirname, '..'), 'docs');

const candidates = [
  process.env.HIVELET_PYTHON,
  'C:\\Users\\Yaska\\AppData\\Local\\Programs\\Python\\Python311\\python.exe',
  'C:\\Python311\\python.exe',
  'python3',
  'python',
].filter(Boolean);

function tryNext(i) {
  if (i >= candidates.length) {
    console.error('[build-docs] No working Python with mkdocs found.');
    console.error('Tried:', candidates.join(', '));
    console.error('Install with: py -3.11 -m pip install mkdocs mkdocs-material');
    process.exit(1);
  }
  const exe = candidates[i];
  const args = ['-m', 'mkdocs', 'build', '--strict', ...process.argv.slice(2)];
  const child = spawn(exe, args, { stdio: 'inherit', cwd });
  child.on('error', () => tryNext(i + 1));
  child.on('exit', (code) => process.exit(code ?? 1));
}

tryNext(0);
