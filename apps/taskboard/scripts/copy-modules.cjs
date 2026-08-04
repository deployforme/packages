const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(__dirname, '..', 'src', 'modules');
const target = path.resolve(__dirname, '..', 'dist', 'modules');

fs.cpSync(source, target, { recursive: true, force: true });
console.log(`Copied ${source} -> ${target}`);
