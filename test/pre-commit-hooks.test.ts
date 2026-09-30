import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSupportedExtensions } from '../src/parser/detect.js';

// The manifest's `files` pattern decides when pre-commit/prek run the hook.
// It must keep covering every extension and manifest file name the parsers
// accept; otherwise a commit that only touches a newly supported language
// silently skips the hook.
const manifest = readFileSync(join(process.cwd(), '.pre-commit-hooks.yaml'), 'utf-8');

function filesPattern(): RegExp {
  const match = manifest.match(/^\s*files:\s*'(.*)'\s*$/m);
  if (!match) throw new Error('.pre-commit-hooks.yaml has no single-quoted `files:` entry');
  // pre-commit compiles the pattern with Python `re`; inline `(?i:...)` groups
  // only landed in Node 23, so emulate the flag for the Node 20/22 CI matrix.
  return new RegExp(match[1].replace('(?i:', '(?:'), 'i');
}

describe('.pre-commit-hooks.yaml', () => {
  it('declares a repository-level depwire hook', () => {
    expect(manifest).toMatch(/^- id: depwire$/m);
    expect(manifest).toMatch(/^\s*entry: depwire$/m);
    expect(manifest).toMatch(/^\s*language: node$/m);
    expect(manifest).toMatch(/^\s*pass_filenames: false$/m);
    expect(manifest).toMatch(/^\s*args: \[parse, \., --stats\]$/m);
  });

  it('runs for every file kind the parsers accept', () => {
    const pattern = filesPattern();
    const missing = [...getSupportedExtensions(), '.h'].filter(extension => {
      const sample = extension.startsWith('.') ? `src/sample${extension}` : `modules/api/${extension}`;
      return !pattern.test(sample);
    });
    expect(missing).toEqual([]);
  });

  it('skips files no parser accepts', () => {
    const pattern = filesPattern();
    for (const sample of ['README.md', 'docs/config.yaml', 'assets/logo.png', 'Makefile', 'src/index.tsx.bak']) {
      expect(pattern.test(sample), sample).toBe(false);
    }
  });
});
