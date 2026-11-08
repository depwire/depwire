import { cpSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const binaryExtensions = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2',
  '.ttf', '.otf', '.pdf', '.zip', '.gz',
]);

function readText(path) {
  const bytes = readFileSync(path);
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le'
    : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8';
  let text;
  try {
    // TextDecoder consumes UTF-8/UTF-16 BOMs and rejects malformed encodings.
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`unexpected binary content in ${path}`);
  }
  if (text.includes('\0')) throw new Error(`unexpected binary content in ${path}`);
  return text;
}

export function scanFile(path) {
  if (binaryExtensions.has(extname(path).toLowerCase())) return;
  if (/\{\{[^}]*\}\}/.test(readText(path))) {
    throw new Error(`Unresolved placeholder in ${path}`);
  }
}

function build() {
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
        writeFileSync(path, readText(path).replaceAll('{{VERSION}}', version));
      }
      scanFile(path);
    }
  }
  stampAndCheck(output);
  console.log(`Built website with version ${version}`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) build();
