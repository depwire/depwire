import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readJson(relativePath) {
  const path = fileURLToPath(new URL(relativePath, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

const packageJson = readJson('../package.json');
const serverJson = readJson('../server.json');
const manifestJson = readJson('../manifest.json');
const expected = packageJson.version;

const versions = [
  ['server.json.version', serverJson.version],
  ['server.json.packages[0].version', serverJson.packages?.[0]?.version],
  ['manifest.json.version', manifestJson.version],
];
const mismatches = versions.filter(([, version]) => version !== expected);

if (mismatches.length > 0) {
  console.error(`Release metadata mismatch: package.json is ${expected}.`);
  for (const [field, version] of mismatches) {
    console.error(`- ${field} is ${version ?? '<missing>'}`);
  }
  process.exit(1);
}

console.log(`Release metadata validated: ${expected}`);
