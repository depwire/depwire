import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url));
const serverPath = fileURLToPath(new URL('../server.json', import.meta.url));
const manifestPath = fileURLToPath(new URL('../manifest.json', import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const packageJson = readJson(packagePath);
const serverJson = readJson(serverPath);
const manifestJson = readJson(manifestPath);

serverJson.version = packageJson.version;
serverJson.packages[0].version = packageJson.version;
manifestJson.version = packageJson.version;

writeJson(serverPath, serverJson);
writeJson(manifestPath, manifestJson);

console.log(`Release metadata synchronized to ${packageJson.version}`);
