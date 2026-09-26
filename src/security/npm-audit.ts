import type { SecurityFinding, Severity } from './types.js';

interface Advisory {
  source: number;
  name: string;
  dependency?: string;
  title: string;
  url?: string;
  range: string;
}
interface Vulnerability {
  severity: string;
  range: string;
  via: (string | Advisory)[];
  nodes?: string[];
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
}
export interface NpmAudit {
  vulnerabilities?: Record<string, Vulnerability>;
}
// undefined = metadata unavailable; null = advisory explicitly lists no patch.
export type AdvisoryPatches = Record<string, string[] | null>;
const advisoryKey = (a: Advisory) => `${a.url || a.source}:${a.name}`;

/** Advisory metadata, rather than fixAvailable or a guessed range boundary, proves patch status. */
export async function loadAdvisoryPatches(audit: NpmAudit): Promise<AdvisoryPatches> {
  const advisories = Object.values(audit.vulnerabilities || {}).flatMap(v => v.via)
    .filter((v): v is Advisory => typeof v !== 'string');
  const requests = new Map<string, Promise<any>>();
  const patches: AdvisoryPatches = {};
  await Promise.all(advisories.map(async a => {
    const id = a.url?.match(/^https:\/\/github\.com\/advisories\/(GHSA-[\w-]+)$/)?.[1];
    if (!id) return;
    if (!requests.has(id)) {
      requests.set(id, fetch(`https://api.github.com/advisories/${id}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(5000),
      }).then(r => r.ok ? r.json() : null).catch(() => null));
    }
    const data = await requests.get(id);
    if (data?.withdrawn_at) return;
    if (!Array.isArray(data?.vulnerabilities)) return;
    const entries = data.vulnerabilities.filter((v: any) =>
      v?.package?.ecosystem === 'npm' && v.package?.name === a.name);
    if (!entries?.length) return;
    const versions = entries.map((v: any) => v.first_patched_version).filter((v: unknown) => typeof v === 'string');
    if (versions.length) patches[advisoryKey(a)] = [...new Set<string>(versions)];
    else if (entries.every((v: any) => v.first_patched_version === null)) patches[advisoryKey(a)] = null;
  }));
  return patches;
}

/** Keep one finding per npm package entry, including aggregate entries. */
export function npmAuditFindings(
  audit: NpmAudit,
  packages: Record<string, { version?: string }> = {},
  patches: AdvisoryPatches = {},
): SecurityFinding[] {
  const vulnerabilities = audit.vulnerabilities || {};
  const label = (name: string) => {
    const versions = [...new Set((vulnerabilities[name]?.nodes || [])
      .map(n => packages[n]?.version).filter(Boolean))];
    return versions.length ? `${name} ${versions.join(', ')}` : name;
  };
  return Object.entries(vulnerabilities).map(([name, vuln]) => {
    const details: string[] = [];
    const fixes = new Set<string>();
    const visit = (current: string, path: string[]) => {
      const entry = vulnerabilities[current];
      if (!entry) { details.push(`${path.map(label).join(' → ')} (advisory details unavailable).`); return; }
      for (const via of entry.via) {
        if (typeof via === 'string') {
          if (path.includes(via)) {
            details.push(`${[...path, via].map(label).join(' → ')} (cyclic audit reference).`);
          } else visit(via, [...path, via]);
          continue;
        }
        const id = via.url?.match(/GHSA-[\w-]+/)?.[0] || `npm advisory ${via.source}`;
        details.push(`${path.map(label).join(' → ')}: ${via.title}. Affected range (${via.name}): ${via.range}. ${id}${via.url ? ` — ${via.url}` : ''}.`);
        const patched = patches[advisoryKey(via)];
        if (patched?.length) fixes.add(`Upstream patch available for ${via.name} (${id}): ${patched.join(', ')}.`);
        else if (patched === null) fixes.add(`No upstream patch exists for ${via.name} (${id}), according to the advisory.`);
        else fixes.add(`Upstream patch availability unknown for ${via.name} (${id}); check the advisory.`);
      }
    };
    visit(name, [name]);
    const automatic = vuln.fixAvailable === false
      ? 'No automatic fix available in this dependency tree.'
      : typeof vuln.fixAvailable === 'object'
        ? `npm proposes updating ${vuln.fixAvailable.name} to ${vuln.fixAvailable.version}${vuln.fixAvailable.isSemVerMajor ? ' (breaking version change)' : ''}.`
        : 'npm reports an automatic fix available in this dependency tree.';
    const transitiveOnly = vuln.via.length > 0 && vuln.via.every(v => typeof v === 'string');
    const severity: Severity = vuln.severity === 'critical' ? 'critical'
      : vuln.severity === 'high' ? 'high' : vuln.severity === 'moderate' ? 'medium' : 'low';
    return {
      id: '', severity, vulnerabilityClass: 'dependency-cve', file: 'package.json',
      title: transitiveOnly ? `Dependency vulnerable via transitives: ${name}` : `Vulnerable dependency: ${name}`,
      description: `${transitiveOnly ? `${name} is flagged only because of vulnerable dependencies. ` : ''}${details.join(' ')}`,
      attackScenario: `An attacker could exploit the reported dependency vulnerabilities affecting ${name}.`,
      suggestedFix: [automatic, ...fixes].join(' '),
    };
  });
}
