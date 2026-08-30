import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SecurityFinding, SuppressedSecurityFinding } from './types.js';

interface NativeBindingAllowlist {
  version: number;
  description: string;
  entries: Array<{ package: string; reason: string }>;
}

let cachedAllowlist: NativeBindingAllowlist | null = null;

export function loadNativeBindingAllowlist(): NativeBindingAllowlist {
  if (cachedAllowlist) return cachedAllowlist;

  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, 'native-binding-allowlist.json'),
    join(moduleDir, 'security', 'native-binding-allowlist.json'),
  ];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as NativeBindingAllowlist;
      if (!Number.isInteger(parsed.version) || !Array.isArray(parsed.entries)) {
        throw new Error('allowlist must contain an integer version and entries array');
      }
      cachedAllowlist = parsed;
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to load native-binding allowlist: ${String(lastError)}`);
}

export function suppressAllowlistedNativeBindings(findings: SecurityFinding[]): {
  findings: SecurityFinding[];
  suppressed: SuppressedSecurityFinding[];
} {
  const allowlist = loadNativeBindingAllowlist();
  const entries = new Map(allowlist.entries.map(entry => [entry.package, entry.reason]));
  const kept: SecurityFinding[] = [];
  const suppressed: SuppressedSecurityFinding[] = [];

  for (const finding of findings) {
    const match = finding.file.match(/^node_modules\/(?:@[^/]+\/)?([^/]+)\/package\.json$/);
    const packageName = match
      ? finding.file.startsWith('node_modules/@')
        ? finding.file.slice('node_modules/'.length, -'/package.json'.length)
        : match[1]
      : null;
    const reason = packageName ? entries.get(packageName) : undefined;
    const isLifecycleFinding =
      finding.severity === 'high' &&
      finding.vulnerabilityClass === 'supply-chain' &&
      finding.title.startsWith('Supply chain risk:');

    if (reason && isLifecycleFinding) {
      suppressed.push({
        ...finding,
        severity: 'none',
        allowlistVersion: allowlist.version,
        suppressionReason: reason,
      });
    } else {
      kept.push(finding);
    }
  }

  return { findings: kept, suppressed };
}
