import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, win32 } from 'node:path';

import { scanFile, shouldCopy } from '../website/build.mjs';

const root = process.cwd();
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const temporaryRoots: string[] = [];
afterEach(() => {
  for (const directory of temporaryRoots.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'depwire-website-'));
  temporaryRoots.push(directory);
  cpSync(join(root, 'website'), join(directory, 'website'), {
    recursive: true,
    filter: path => relative(join(root, 'website'), path).split(/[\\/]/)[0] !== 'dist',
  });
  cpSync(join(root, 'package.json'), join(directory, 'package.json'));
  return directory;
}

function build(directory: string) {
  return spawnSync(process.execPath, [join(directory, 'website', 'build.mjs')], { encoding: 'utf8' });
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe('release documentation', () => {
  const pins = [...readFileSync(join(root, 'README.md'), 'utf8').matchAll(/\brev:\s*v([^\s`"']+)/g)];

  it('has at least one README release pin', () => {
    expect(pins.length).toBeGreaterThan(0);
  });

  it('keeps every README release pin equal to package.json version', () => {
    for (const pin of pins) expect(pin[1]).toBe(version);
  });

  it('deploys only the built website from the checklist', () => {
    const checklist = readFileSync(join(root, '.github', 'RELEASE_CHECKLIST.md'), 'utf8');
    const commands = checklist.split(/\r?\n/).filter(line => /pages\s+deploy/.test(line));
    expect(commands).toEqual([
      '- [ ] `npm run website:build && wrangler pages deploy website/dist --project-name depwire`',
    ]);
  });
});

describe('website build', () => {
  it('matches exclusions with Windows relative paths on every platform', () => {
    const source = 'C:\\repo\\website';
    for (const excluded of ['build.mjs', 'dist', 'dist/index.html', 'review.md', 'assets/review.MD', '.DS_Store', 'assets/.DS_Store']) {
      expect(shouldCopy(win32.relative(source, win32.join(source, excluded))), excluded).toBe(false);
    }
    for (const included of ['index.html', 'assets/icon.png', 'assets/architecture.svg', 'assets/build.mjs']) {
      expect(shouldCopy(win32.relative(source, win32.join(source, included))), included).toBe(true);
    }
  });

  it('produces dist without placeholders or Markdown and stamps both footers exactly', () => {
    const directory = fixture();
    writeFileSync(join(directory, 'website', 'review.md'), '{{REVIEW}}');
    const result = build(directory);
    expect(result.status, result.stderr).toBe(0);
    const output = join(directory, 'website', 'dist');
    const builtFiles = files(output);
    expect(builtFiles.length).toBeGreaterThan(0);
    for (const path of builtFiles) {
      expect(path).not.toMatch(/\.md$/i);
      expect(() => scanFile(path)).not.toThrow();
    }
    for (const page of ['index.html', 'privacy.html']) {
      const html = readFileSync(join(output, page), 'utf8');
      expect(html.match(/Current release v[^<]* on npm/g)).toEqual([`Current release v${version} on npm`]);
      expect(html).toBe(readFileSync(join(root, 'website', page), 'utf8').replaceAll('{{VERSION}}', version));
    }
  });

  it('rejects unknown placeholders in non-HTML assets', () => {
    const directory = fixture();
    writeFileSync(join(directory, 'website', 'assets', 'unknown.txt'), '{{FOO}}');
    const result = build(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unresolved placeholder');
  });

  it.each([
    ['utf16le.svg', Buffer.from('\ufeff<svg>{{X}}</svg>', 'utf16le'), 'Unresolved placeholder'],
    ['utf16be.svg', Buffer.from('\ufeff<svg>{{X}}</svg>', 'utf16le').swap16(), 'Unresolved placeholder'],
    ['nul.css', Buffer.from('\0{{X}}'), 'unexpected binary content'],
    ['unknown.custom', Buffer.from('{{X}}'), 'Unresolved placeholder'],
    ['bom.txt', Buffer.from('\ufeff{{X}}'), 'Unresolved placeholder'],
    ['invalid.txt', Buffer.from([0xff]), 'unexpected binary content'],
  ])('rejects unsafe text asset %s', (name, bytes, error) => {
    const directory = fixture();
    const path = join(directory, 'website', 'assets', name);
    writeFileSync(path, bytes);
    expect(() => scanFile(path)).toThrow(error);
    const result = build(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });

  it('allows placeholder bytes in an allowlisted PNG', () => {
    const directory = fixture();
    const path = join(directory, 'website', 'assets', 'binary.png');
    const bytes = Buffer.from('\0{{X}}');
    writeFileSync(path, bytes);
    expect(() => scanFile(path)).not.toThrow();
    const result = build(directory);
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(join(directory, 'website', 'dist', 'assets', 'binary.png'))).toEqual(bytes);
  });

  it.each([undefined, '', '1.2', '01.2.3', '1.2.3-01', '1.2.3\n'])('rejects invalid package version %s', invalid => {
    const directory = fixture();
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: invalid }));
    const result = build(directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('valid SemVer');
  });
});
