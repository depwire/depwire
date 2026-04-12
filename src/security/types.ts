export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type VulnerabilityClass =
  | 'dependency-cve'
  | 'shell-injection'
  | 'code-injection'
  | 'secrets'
  | 'path-traversal'
  | 'auth'
  | 'input-validation'
  | 'information-disclosure'
  | 'architecture'
  | 'cryptography'
  | 'supply-chain'
  | 'frontend-xss';

export interface SecurityFinding {
  id: string;
  severity: Severity;
  vulnerabilityClass: VulnerabilityClass;
  file: string;
  line?: number;
  symbol?: string;
  title: string;
  description: string;
  attackScenario: string;
  suggestedFix: string;
  graphReachability?: {
    entryPoints: string[];
    reachableFrom: number;
    elevatedBy: string;
  };
}

export interface SecurityScanResult {
  scannedAt: string;
  projectRoot: string;
  filesScanned: number;
  findings: SecurityFinding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  dependencyAudit: {
    ran: boolean;
    packageManager: string | null;
    rawOutput: string;
  };
}

export interface SecurityScanOptions {
  target?: string;
  classes?: VulnerabilityClass[];
  format?: 'table' | 'json' | 'sarif';
  failOn?: Severity;
  graphAware?: boolean;
}
