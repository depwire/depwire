import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
const output = join(source, 'dist');
const { version } = JSON.parse(readFileSync(join(source, '..', 'package.json'), 'utf8'));
// SemVer 2.0: numeric identifiers cannot have leading zeroes (except build metadata).
const numeric = '(?:0|[1-9][0-9]*)';
const prerelease = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${prerelease}(?:\\.${prerelease})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
if (typeof version !== 'string' || version.trim() !== version || !semver.test(version)) {
  throw new Error('package.json version must be a valid SemVer version');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const entry of readdirSync(source)) {
  const path = join(source, entry);
  if (path === output) continue;
  cpSync(path, join(output, entry), {
    recursive: true,
    filter: path => path !== fileURLToPath(import.meta.url)
      && !/\.md$/i.test(path) && !path.endsWith('/.DS_Store'),
  });
}

function stampAndCheck(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      stampAndCheck(path);
      continue;
    }
    if (/\.html$/i.test(entry.name)) {
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll('{{VERSION}}', version));
    }
    // NUL bytes identify binary assets; scan all text regardless of extension.
    const bytes = readFileSync(path);
    if (!bytes.includes(0) && /\{\{[^}]*\}\}/.test(bytes.toString('utf8'))) {
      throw new Error(`Unresolved placeholder in ${path}`);
    }
  }
}
stampAndCheck(output);
console.log(`Built website with version ${version}`);
