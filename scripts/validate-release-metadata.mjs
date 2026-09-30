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

// Registries parse the license as an SPDX identifier; "BUSL-1.1" is the only
// valid spelling of the Business Source License (BSL-1.0 is Boost).
const expectedLicense = 'BUSL-1.1';
const licenses = [
  ['package.json.license', packageJson.license],
  ['manifest.json.license', manifestJson.license],
];
const badLicenses = licenses.filter(([, license]) => license !== expectedLicense);
if (badLicenses.length > 0) {
  console.error(`Release metadata mismatch: license must be the SPDX identifier ${expectedLicense}.`);
  for (const [field, license] of badLicenses) {
    console.error(`- ${field} is ${license ?? '<missing>'}`);
  }
  process.exit(1);
}

console.log(`Release metadata validated: ${expected}`);
