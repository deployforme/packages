const fs = require('fs');
const path = require('path');

const versionType = process.argv[2] || 'patch';

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  
  switch(type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

const packagesDir = path.join(__dirname, '../packages');
const packages = fs.readdirSync(packagesDir);

packages.forEach(pkg => {
  const pkgPath = path.join(packagesDir, pkg, 'package.json');
  
  if (fs.existsSync(pkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const oldVersion = pkgJson.version;
    const newVersion = bumpVersion(oldVersion, versionType);
    
    pkgJson.version = newVersion;
    
    fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
    console.log(`${pkgJson.name}: ${oldVersion} -> ${newVersion}`);
  }
});

console.log(`\nAll packages bumped to ${versionType} version!`);
