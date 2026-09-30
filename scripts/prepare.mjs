// npm `prepare` lifecycle script (see "prepare" in package.json).
//
// `dist/` is git-ignored, so anything that installs this package straight from
// git needs to build it first. The main consumer is the pre-commit / prek hook
// (.pre-commit-hooks.yaml): both runners install the hook repo with
// `npm install -g git+file://<clone>`, and npm runs `prepare` for git
// dependencies before packing them.
//
// Two quirks this script works around:
//   1. In a global install (`-g`), npm leaks `npm_config_global=true` into the
//      nested `npm install` that is supposed to install the clone's
//      devDependencies, so it installs nothing and tsup is missing when
//      `prepare` runs. We install devDependencies ourselves in that case.
//   2. The same leaked config would make `npm run build` look for package.json
//      in the global prefix, so every npm call here runs with the global /
//      prefix settings removed from the environment.
//
// `prepare` also runs on plain `npm install` in a checkout, on `npm pack` and
// on `npm publish`; there the devDependencies are already present and this is
// simply `npm run build`. It is a no-op when `src/` is absent (production-only
// installs that ship just package.json). Everything is logged to stderr so
// `npm pack --json` (scripts/smoke-packed.mjs) keeps a clean stdout.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (!existsSync(join(root, 'src', 'index.ts'))) {
  console.error('[depwire] prepare: no sources in this install, skipping build');
  process.exit(0);
}

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^npm_config_(global|prefix|location|install_links|omit)$/i.test(key) || key === 'NPM_CONFIG_PREFIX') {
    delete env[key];
  }
}

function npm(args) {
  // npm.cmd needs cmd.exe on Windows; every argument here is controlled locally.
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root, env, stdio: ['ignore', 2, 2], shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`[depwire] prepare: npm ${args[0]} failed`);
    process.exit(result.status ?? 1);
  }
}

function hasBuildTooling() {
  try {
    createRequire(join(root, 'package.json')).resolve('tsup');
    return true;
  } catch {
    return false;
  }
}

if (!hasBuildTooling()) {
  console.error('[depwire] prepare: build tooling missing, installing devDependencies');
  npm(['install', '--no-save', '--no-audit', '--no-fund', '--ignore-scripts', '--include=dev']);
}

npm(['run', 'build']);
